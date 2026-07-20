const config = {
  displayName: "pom",
  extensionsToTreatAsEsm: [".ts", ".tsx", ".mts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  testRegex: ".*\\.test\\.tsx?$",
  testTimeout: 60000,
  transform: {
    "^.+\\.m?tsx?$": [
      "@swc/jest",
      {
        isModule: true,
        jsc: {
          parser: {
            decorators: true,
            syntax: "typescript",
            tsx: true,
          },
          target: "es2022",
          transform: {
            decoratorMetadata: true,
            legacyDecorator: true,
            react: {
              runtime: "automatic",
            },
          },
        },
        module: {
          type: "es6",
        },
      },
    ],
  },
  // Workaround for a known issue with memory leaks in ESM mode.
  // See https://jestjs.io/docs/configuration#workeridlememorylimit-numberstring
  workerIdleMemoryLimit: 0.9,
};

export default config;
