import React, { useState, useEffect, useRef } from 'react';

export interface UseStickyTableHeaderOptions {
  dependencies?: any[];
  topOffsetAdjustment?: number;
  minBottomThreshold?: number;
}

export function useStickyTableHeader(options: UseStickyTableHeaderOptions = {}) {
  const { dependencies = [], topOffsetAdjustment = 0, minBottomThreshold = 70 } = options;

  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const realTheadRef = useRef<HTMLTableSectionElement>(null);

  const [isStickyHeaderVisible, setIsStickyHeaderVisible] = useState(false);
  const [stickyTopOffset, setStickyTopOffset] = useState(0);
  const [tableBounds, setTableBounds] = useState<{ left: number; width: number; tableWidth: number }>({
    left: 0,
    width: 0,
    tableWidth: 0,
  });
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [tableScrollLeft, setTableScrollLeft] = useState(0);

  const touchStartX = useRef(0);
  const touchStartScroll = useRef(0);

  useEffect(() => {
    const getTopOffset = () => {
      let offset = 0;
      // 1. Sandbox banner
      const banner = document.querySelector('.bg-gradient-to-r.from-amber-500');
      if (banner) {
        const bRect = banner.getBoundingClientRect();
        if (bRect.bottom > 0) offset += bRect.height;
      }
      // 2. Mobile app-header (< 1024px)
      if (window.innerWidth < 1024) {
        const appHeader = document.querySelector('.app-header');
        if (appHeader) {
          const hRect = appHeader.getBoundingClientRect();
          if (hRect.bottom > 0) offset += hRect.height;
        }
      }
      return offset + topOffsetAdjustment;
    };

    const handleScrollAndResize = () => {
      if (!tableWrapperRef.current || !realTheadRef.current) return;
      const theadRect = realTheadRef.current.getBoundingClientRect();
      const wrapperRect = tableWrapperRef.current.getBoundingClientRect();
      const topOffset = getTopOffset();

      // If real thead top has scrolled above topOffset AND table bottom is still visible
      if (theadRect.top < topOffset && wrapperRect.bottom > topOffset + minBottomThreshold) {
        const thElements = realTheadRef.current.querySelectorAll('th');
        const widths = Array.from(thElements).map((th) => th.getBoundingClientRect().width);

        setIsStickyHeaderVisible(true);
        setStickyTopOffset(topOffset);
        setTableBounds({
          left: wrapperRect.left,
          width: wrapperRect.width,
          tableWidth: tableRef.current?.offsetWidth || wrapperRect.width,
        });
        setColWidths(widths);
        setTableScrollLeft(tableWrapperRef.current.scrollLeft);
      } else {
        setIsStickyHeaderVisible(false);
      }
    };

    const handleWrapperScroll = () => {
      if (tableWrapperRef.current) {
        setTableScrollLeft(tableWrapperRef.current.scrollLeft);
      }
    };

    window.addEventListener('scroll', handleScrollAndResize, { passive: true });
    window.addEventListener('resize', handleScrollAndResize, { passive: true });
    const wrapper = tableWrapperRef.current;
    if (wrapper) {
      wrapper.addEventListener('scroll', handleWrapperScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleScrollAndResize);
      window.removeEventListener('resize', handleScrollAndResize);
      if (wrapper) {
        wrapper.removeEventListener('scroll', handleWrapperScroll);
      }
    };
  }, dependencies);

  const floatingHeaderTouchProps = {
    onTouchStart: (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartScroll.current = tableWrapperRef.current?.scrollLeft || 0;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const delta = touchStartX.current - e.touches[0].clientX;
      if (tableWrapperRef.current) {
        tableWrapperRef.current.scrollLeft = touchStartScroll.current + delta;
      }
    },
  };

  return {
    tableWrapperRef,
    tableRef,
    realTheadRef,
    isStickyHeaderVisible,
    stickyTopOffset,
    tableBounds,
    colWidths,
    tableScrollLeft,
    floatingHeaderTouchProps,
  };
}
