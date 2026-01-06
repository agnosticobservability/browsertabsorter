
import { getGenera } from '../src/background/extraction/generaRegistry.js';

const testCases = [
  // Search
  { hostname: 'google.com', expected: 'Search' },
  { hostname: 'www.google.com', expected: 'Search' },
  { hostname: 'search.yahoo.com', expected: 'Search' },

  // Social
  { hostname: 'twitter.com', expected: 'Social' },
  { hostname: 'api.twitter.com', expected: 'Social' },
  { hostname: 'linkedin.com', expected: 'Social' },

  // Development
  { hostname: 'github.com', expected: 'Development' },
  { hostname: 'gist.github.com', expected: 'Development' },
  { hostname: 'console.aws.amazon.com', expected: 'Development' },
  { hostname: 'aws.amazon.com', expected: 'Development' },

  // Unknown
  { hostname: 'example.com', expected: null },
  { hostname: 'unknown-site.org', expected: null },
  { hostname: '', expected: null }
];

console.log('Running Genera Registry Tests...');
let passed = 0;
let failed = 0;

testCases.forEach(({ hostname, expected }) => {
  const result = getGenera(hostname);
  if (result === expected) {
    passed++;
  } else {
    console.error(`FAILED: ${hostname} -> Expected ${expected}, got ${result}`);
    failed++;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
