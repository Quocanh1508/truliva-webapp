/**
 * Seed Script: Migrate 6 combo hardcoded definitions → Database
 * 
 * Chạy trên VPS: cd /var/www/truliva && node dist/scripts/seedComboDefinitions.js
 * Script idempotent: chạy lại không bị trùng (upsert by comboKey)
 */

import prisma from '../config/database';

interface SeedCombo {
  comboKey: string;
  displayName: string;
  keywords: string[];
  components: Array<{ componentName: string; componentSku?: string; quantity: number }>;
}

const SEED_COMBOS: SeedCombo[] = [
  {
    comboKey: 'W6412-ECO',
    displayName: 'Gói Giải pháp W6412 ECO',
    keywords: ['w6412', 'eco'],
    components: [
      { componentName: 'Máy lọc nước Truliva UR3626', componentSku: '104338-0002', quantity: 1 },
      { componentName: 'Máy nóng lạnh treo tường Truliva W6412', componentSku: '103057-001', quantity: 1 }
    ]
  },
  {
    comboKey: 'W6412-GOLD',
    displayName: 'Gói Giải pháp W6412 GOLD',
    keywords: ['w6412', 'gold'],
    components: [
      { componentName: 'Máy lọc nước Truliva UR3626', componentSku: '104338-0002', quantity: 1 },
      { componentName: 'Máy nóng lạnh treo tường Truliva W6412', componentSku: '103057-001', quantity: 1 }
    ]
  },
  {
    comboKey: 'W6412-PLATINUM',
    displayName: 'Gói Giải pháp W6412 PLATINUM',
    keywords: ['w6412', 'platinum'],
    components: [
      { componentName: 'Máy lọc nước Truliva UR3626', componentSku: '104338-0002', quantity: 1 },
      { componentName: 'Máy nóng lạnh treo tường Truliva W6412', componentSku: '103057-001', quantity: 1 }
    ]
  },
  {
    comboKey: 'COMBO-5676-GOLD',
    displayName: 'Combo Lõi lọc UR5676/5640/5440',
    keywords: ['combo', '5676'],
    components: [
      { componentName: 'Lõi lọc PGP Truliva UR5676/UR5640/UR5440', quantity: 1 },
      { componentName: 'Lõi lọc CTO Truliva UR5676/UR5640/UR5440', quantity: 1 }
    ]
  },
  {
    comboKey: 'COMBO-5840-2LOI',
    displayName: 'Combo Lõi lọc UR5840 (2 Lõi)',
    keywords: ['combo', '5840'],
    components: [
      { componentName: 'Lõi lọc PGP Truliva UR5840', quantity: 1 },
      { componentName: 'Lõi lọc CTO Truliva UR5840', quantity: 1 }
    ]
  },
  {
    comboKey: 'COMBO-5840-3LOI',
    displayName: 'Combo Lõi lọc UR5840 (3 Lõi)',
    keywords: ['combo', '5840', '3 lõi', 'ro'],
    components: [
      { componentName: 'Lõi lọc PGP Truliva UR5840', quantity: 1 },
      { componentName: 'Lõi lọc CTO Truliva UR5840', quantity: 1 },
      { componentName: 'Lõi lọc RO Truliva UR5840', quantity: 1 }
    ]
  }
];

async function seedComboDefinitions() {
  console.log('🔧 Starting combo definitions seed...\n');

  let created = 0;
  let skipped = 0;

  for (const combo of SEED_COMBOS) {
    const existing = await prisma.productCombo.findUnique({
      where: { comboKey: combo.comboKey }
    });

    if (existing) {
      console.log(`  ⏭️  SKIP: ${combo.comboKey} (${combo.displayName}) — already exists`);
      skipped++;
      continue;
    }

    await prisma.productCombo.create({
      data: {
        comboKey: combo.comboKey,
        displayName: combo.displayName,
        keywords: combo.keywords,
        sortOrder: created,
        components: {
          create: combo.components.map((c, idx) => ({
            componentName: c.componentName,
            componentSku: c.componentSku || null,
            quantity: c.quantity,
            sortOrder: idx
          }))
        }
      }
    });

    console.log(`  ✅ CREATED: ${combo.comboKey} (${combo.displayName}) — ${combo.components.length} components`);
    created++;
  }

  console.log(`\n📊 Summary: ${created} created, ${skipped} skipped (already existed)`);
  console.log('✅ Combo definitions seed completed!');
}

seedComboDefinitions()
  .catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
