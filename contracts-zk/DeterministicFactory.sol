// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/libraries/SystemContractsCaller.sol";

contract DeploymentFactory {

    fallback() external payable {
        // Decode msg.data to the parameters
        (bytes32 salt, bytes32 bytecodeHash, bytes memory input) = abi.decode(msg.data, (bytes32, bytes32, bytes));
        (bool success,) = SystemContractsCaller
            .systemCallWithReturndata(
                uint32(gasleft()),
                address(DEPLOYER_SYSTEM_CONTRACT),
                uint128(msg.value),
                abi.encodeCall(
                    DEPLOYER_SYSTEM_CONTRACT.create2,
                    (salt, bytecodeHash, input)
                )
            );
        require(success, "Deployment failed");
    }
}
