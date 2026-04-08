/** @type {import('jest').Config} */
module.exports = {
  roots: ['<rootDir>'],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        moduleResolution: 'bundler',
        target: 'ES2017',
        module: 'ESNext',
        ignoreDeprecations: '6.0',
        rootDir: '<rootDir>'
      }
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePathIgnorePatterns: [
    '<rootDir>/test/__fixtures__',
    '<rootDir>/node_modules',
    '<rootDir>/dist',
    '<rootDir>/.next'
  ],
  preset: 'ts-jest'
};
