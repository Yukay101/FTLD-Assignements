// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract Hello {
    string sayIt = "Hello World";

    function sayHello() external view returns (string memory) {
        return sayIt;
    }
}
