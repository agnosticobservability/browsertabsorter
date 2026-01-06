
import { getGenera } from '../src/background/extraction/generaRegistry.js';

const customRegistry = {
    'mysite.com': 'MyCategory',
    'work.internal': 'Work',
    'sub.domain.com': 'SubCategory'
};

const testCases = [
  // Existing functionality
  { hostname: 'google.com', custom: undefined, expected: 'Search' },
  { hostname: 'www.google.com', custom: undefined, expected: 'Search' },

  // Custom Registry Direct Match
  { hostname: 'mysite.com', custom: customRegistry, expected: 'MyCategory' },
  { hostname: 'work.internal', custom: customRegistry, expected: 'Work' },

  // Custom Registry Subdomain Match
  { hostname: 'api.mysite.com', custom: customRegistry, expected: 'MyCategory' },

  // Custom Registry Override (if we wanted to override google, let's test that)
  { hostname: 'google.com', custom: {'google.com': 'MySearch'}, expected: 'MySearch' },

  // Mixed
  { hostname: 'github.com', custom: customRegistry, expected: 'Development' }, // Fallback to static
  { hostname: 'sub.domain.com', custom: customRegistry, expected: 'SubCategory' },
  { hostname: 'deep.sub.domain.com', custom: customRegistry, expected: 'SubCategory' }
];

console.log('Running Custom Genera Registry Tests...');
let passed = 0;
let failed = 0;

testCases.forEach(({ hostname, custom, expected }) => {
  const result = getGenera(hostname, custom);
  if (result === expected) {
    passed++;
  } else {
    console.error(`FAILED: ${hostname} (Custom: ${custom ? 'Yes' : 'No'}) -> Expected ${expected}, got ${result}`);
    failed++;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
