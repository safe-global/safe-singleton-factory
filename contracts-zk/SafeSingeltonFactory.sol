// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/libraries/SystemContractsCaller.sol";

/**
 * The purpose of this contract is to provide a factory that deterministically deploys arbitrary contracts.
 * The advantage is that once such a contract has been deployed and verified, deployment flows can be 
 * easily reproduced in a deterministic way. This removed centralization (reliance on a specific deployment key)
 * and improves security (as it is easy to verify deployed code).
 * The factory should follow the same pattern as https://github.com/Arachnid/deterministic-deployment-proxy:
 * - only the `to` of a transaction has to be adjusted
 * - allow to specify a `salt` by prepending it to the deployment data
 */
contract SafeSingeltonFactory {

    fallback() external payable {
        // The expected data format is <salt:bytes32><deploymentCalldata:bytes>
        // Where deploymenCalldata is a call to create/create2 of the DEPLOYER_SYSTEM_CONTRACT contract.
        bytes32 salt = bytes32(msg.data[:32]);
        bytes32 calldataSalt = bytes32(msg.data[36:68]);
        // The factory overrides the salt provided in the deploymentCalldata,
        // therefore it is checked that both are the same or 
        // that the salt in the deploymentCalldata was not set (is a zero hash)
        require(calldataSalt == bytes32(0) || calldataSalt == salt, "Unexpected salt");
        bytes4 methodId = bytes4(msg.data[32:36]);
        // The factory will only proxy creations that use the create/create2 functions of the system contract.
        // Both methods have the same signature and allow us to replace the salt and method id without issues.
        require(
            methodId == DEPLOYER_SYSTEM_CONTRACT.create.selector || methodId == DEPLOYER_SYSTEM_CONTRACT.create2.selector, 
            "Unexpected methodId"
        );
        // We cut off the method id (4 bytes) and salt (32 bytes) of the deploymentCalldata
        // as we overwrite it with the salt provided to the factory.
        // This is possible because we replace these with other values of the same size,
        // therefore the overall payload send to the system contract is still valid and well formed.
        bytes memory truncatedDeploymentCalldata = msg.data[68:];
        (bool success,) = SystemContractsCaller
            .systemCallWithReturndata(
                uint32(gasleft()),
                address(DEPLOYER_SYSTEM_CONTRACT),
                uint128(msg.value),
                abi.encodePacked(
                    DEPLOYER_SYSTEM_CONTRACT.create2.selector,
                    salt,
                    truncatedDeploymentCalldata
                )
            );
        require(success, "Deployment failed");
    }
}