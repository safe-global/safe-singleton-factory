"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSingletonFactoryInfo = void 0;
const getSingletonFactoryInfo = (chainId) => {
    try {
        return require(`../artifacts/${chainId}/deployment.json`);
    }
    catch (_a) {
        return undefined;
    }
};
exports.getSingletonFactoryInfo = getSingletonFactoryInfo;
//# sourceMappingURL=index.js.map