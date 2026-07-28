/**
 * Validation Runner
 * 
 * Executes comprehensive end-to-end validation of the entire pipeline
 * Usage: npx ts-node scripts/validate.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { ValidationHarness } from '../lib/validation/test-harness';

// Load environment
config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Enterprise Business Discovery Engine - Validation Suite      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const harness = new ValidationHarness(redisUrl);

  try {
    await harness.initialize();
    const report = await harness.runAllTests();

    // Print report
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  VALIDATION REPORT                                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`Total Tests: ${report.totalTests}`);
    console.log(`Passed: ${report.passed} ✓`);
    console.log(`Failed: ${report.failed} ✗\n`);

    if (report.issues.length > 0) {
      console.log('Issues Found:');
      report.issues.forEach((issue) => console.log(`  • ${issue}`));
      console.log();
    }

    console.log('Recommendations:');
    report.recommendations.forEach((rec) => console.log(`  • ${rec}`));
    console.log();

    if (report.productionReady) {
      console.log('✓ PRODUCTION READY');
      process.exit(0);
    } else {
      console.log('✗ NOT PRODUCTION READY - Fix issues before deployment');
      process.exit(1);
    }
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  }
}

main();
