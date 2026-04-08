/** @type {import('jest').Config} */
module.exports = {
  roots: ['<rootDir>'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        moduleResolution: 'bundler',
        target: 'ES2017',
        module: 'ESNext',
        ignoreDeprecations: '6.0'
      }
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePathIgnorePatterns: [
    '<rootDir>/test/__fixtures__',
    '<rootDir>/node_modules',
    '<rootDir>/dist'
  ],
  preset: 'ts-jest'
};
