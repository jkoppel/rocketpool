// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import {RocketStorageInterface} from "../../../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketBase} from "../../../RocketBase.sol";
import {RocketDAOProtocolSettings} from "./RocketDAOProtocolSettings.sol";

/// @notice Network megapool settings
contract RocketDAOProtocolSettingsMegapool is RocketDAOProtocolSettings, RocketDAOProtocolSettingsMegapoolInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "megapool") {
        version = 1;
        // Initialise settings on deployment
        if (!rocketStorage.getDeployedStatus()) {
            initialise();
        }
    }

    /// @notice Called during deployment or upgrade to set initial values for settings
    function initialise() override public {
        // Set defaults
        _setSettingUint("megapool.time.before.dissolve", 2 weeks);               // 2 weeks (RPIP-59)
        _setSettingUint("maximum.megapool.eth.penalty", 612 ether);              // RPIP-42
        // Update deploy flag
        require (!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed"))), "Already initialised");
        setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    /// @param _settingPath The path of the setting within this contract's namespace
    /// @param _value The value to set it to
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Some safety guards for certain settings
            bytes32 settingKey = keccak256(abi.encodePacked(_settingPath));
            if (settingKey == keccak256(abi.encodePacked("megapool.time.before.dissolve"))) {
                // TODO: No guardrail is specified in RPIP-59 but there should probably be a minimum?
                require(_value >= 48 hours, "Time must be greater than 48 hours");
            } else if (settingKey == keccak256(abi.encodePacked("maximum.megapool.eth.penalty"))) {
                // Per RPIP-42
                // TODO: This is a placeholder value
                require(_value >= 300 ether, "Penalty must equal or exceed 300 ETH");
            }
        }
        // Update setting now
        _setSettingUint(_settingPath, _value);
    }

    /// @dev Directly updates a setting, no guardrails applied
    function _setSettingUint(string memory _settingPath, uint256 _value) internal {
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /// @notice Returns how long after an assignment a watcher must wait to dissolve a megapool validator (seconds)
    function getTimeBeforeDissolve() override external view returns (uint256) {
        return getSettingUint("megapool.time.before.dissolve");
    }

    /// @notice Returns the maximum amount a megapool can be penalised in 50,400 consecutive slots (~7 days)
    function getMaximumEthPenalty() override external view returns (uint256) {
        return getSettingUint("maximum.megapool.eth.penalty");
    }
}
