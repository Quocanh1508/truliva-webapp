import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<any>;
  children: React.ReactNode;
  pullThreshold?: number;
}

export default function PullToRefresh({
  onRefresh,
  children,
  pullThreshold = 65
}: PullToRefreshProps) {
  const [pullOffset, setPullOffset] = useState(0);
  const [refreshState, setRefreshState] = useState<'idle' | 'pull' | 'release' | 'refreshing'>('idle');
  const containerRef = useRef<HTMLDivElement>(null);
  
  const touchStartRef = useRef({ x: 0, y: 0 });
  const isPullingRef = useRef(false);
  const stateRef = useRef(refreshState);
  stateRef.current = refreshState;

  // Stale closure prevention using refs
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Helper to find the nearest scrollable parent element
  const getScrollParent = (node: HTMLElement | null): HTMLElement => {
    if (!node) return document.documentElement;
    let parent = node.parentElement;
    while (parent) {
      if (parent === document.body || parent === document.documentElement) {
        return document.documentElement;
      }
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return document.documentElement;
  };

  const triggerRefresh = async () => {
    setRefreshState('refreshing');
    setPullOffset(55); // Hold indicator at 55px while loading data
    
    try {
      await onRefreshRef.current();
    } catch (err) {
      console.error('Pull-to-refresh action error:', err);
    } finally {
      // Return back to top smoothly
      setPullOffset(0);
      setRefreshState('idle');
    }
  };

  const triggerRefreshRef = useRef(triggerRefresh);
  triggerRefreshRef.current = triggerRefresh;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollParent = getScrollParent(container);

    // Prevent default browser-managed pull-to-refresh on this container
    const originalOverscroll = scrollParent.style.overscrollBehaviorY;
    scrollParent.style.overscrollBehaviorY = 'contain';

    const handleTouchStart = (e: TouchEvent) => {
      // Do not pull if currently refreshing
      if (stateRef.current === 'refreshing') return;

      const scrollTop = scrollParent === document.documentElement 
        ? window.scrollY 
        : scrollParent.scrollTop;

      // Only allow pulling if scroll container is at the very top
      if (scrollTop <= 0 && e.touches.length === 1) {
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
        isPullingRef.current = true;
      } else {
        isPullingRef.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || stateRef.current === 'refreshing') return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = currentX - touchStartRef.current.x;
      const diffY = currentY - touchStartRef.current.y;

      // Only pull down vertically, check if vertical pull is dominant
      if (diffY > 0 && Math.abs(diffY) > Math.abs(diffX)) {
        // Prevent browser overscroll/refresh gestures
        if (e.cancelable) {
          e.preventDefault();
        }

        // Apply resistance to pulling to make it feel natural
        const resistance = 0.4;
        const offset = Math.min(diffY * resistance, 110); // cap pull height at 110px
        
        setPullOffset(offset);
        if (offset >= pullThreshold) {
          setRefreshState('release');
        } else {
          setRefreshState('pull');
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current || stateRef.current === 'refreshing') return;
      isPullingRef.current = false;

      if (stateRef.current === 'release') {
        triggerRefreshRef.current();
      } else {
        // Return back to top smoothly
        setPullOffset(0);
        setRefreshState('idle');
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      scrollParent.style.overscrollBehaviorY = originalOverscroll;
    };
  }, [pullThreshold]);

  // Rotate the refresh icon as the user pulls down
  const rotationAngle = Math.min(pullOffset * 4, 360);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      {/* Pull indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex items-end justify-center bg-gray-55 border-b border-gray-150 z-20 overflow-hidden"
        style={{ 
          height: `${pullOffset}px`,
          opacity: pullOffset > 0 ? 1 : 0,
          transition: refreshState === 'idle' || refreshState === 'refreshing' 
            ? 'height 0.25s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.25s' 
            : 'none'
        }}
      >
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-gray-500 h-[50px] w-full pb-3">
          <div 
            className={refreshState === 'refreshing' ? 'animate-spin' : ''}
            style={{ 
              transform: refreshState === 'refreshing' ? undefined : `rotate(${rotationAngle}deg)`,
              transition: refreshState === 'refreshing' ? undefined : 'transform 0.1s ease-out',
              display: 'inline-flex'
            }}
          >
            <RefreshCw size={14} className="text-blue-600" />
          </div>
          <span>
            {refreshState === 'pull' && 'Kéo xuống để cập nhật'}
            {refreshState === 'release' && 'Thả ra để cập nhật'}
            {refreshState === 'refreshing' && 'Đang cập nhật...'}
          </span>
        </div>
      </div>

      {/* Target Content */}
      <div 
        className="w-full origin-top"
        style={{
          transform: `translateY(${pullOffset}px)`,
          transition: refreshState === 'idle' || refreshState === 'refreshing' 
            ? 'transform 0.25s cubic-bezier(0.1, 0.8, 0.3, 1)' 
            : 'none'
        }}
      >
        {children}
      </div>
    </div>
  );
}
