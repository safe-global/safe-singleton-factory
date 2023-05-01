// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/libraries/SystemContractsCaller.sol";

contract DeploymentFactory {

    function deployContract(
        bytes32 salt,
        bytes32 bytecodeHash,
        bytes calldata input
    ) external returns (address contractAddress) {
        (bool success, bytes memory returnData) = SystemContractsCaller
            .systemCallWithReturndata(
                uint32(gasleft()),
                address(DEPLOYER_SYSTEM_CONTRACT),
                uint128(0),
                abi.encodeCall(
                    DEPLOYER_SYSTEM_CONTRACT.create2,
                    (salt, bytecodeHash, input)
                )
            );
        require(success, "Deployment failed");

        (contractAddress) = abi.decode(returnData, (address));
    }
}
