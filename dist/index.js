"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeployment = void 0;
const getDeployment = (chainId) => {
    try {
        return require(`../artifacts/${chainId}/deployment.json`);
    }
    catch (_a) {
        return undefined;
    }
};
exports.getDeployment = getDeployment;
//# sourceMappingURL=index.js.map