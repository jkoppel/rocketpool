import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    setDAOProtocolBootstrapSecurityInvite,
    setDAOProtocolBootstrapSetting,
} from './scenario-dao-protocol-bootstrap';
import { userDeposit } from '../_helpers/deposit';
import {
    getDaoProtocolSecurityLeaveTime,
    getDaoProtocolVoteDelayTime,
    getDaoProtocolVotePhase1Time,
    getDaoProtocolVotePhase2Time,
} from '../_helpers/dao';
import {
    daoSecurityExecute,
    daoSecurityMemberJoin,
    daoSecurityMemberLeave,
    daoSecurityMemberRequestLeave,
    daoSecurityPropose,
    daoSecurityVote,
} from './scenario-dao-security';
import { getDepositSetting } from '../_helpers/settings';
import {
    RocketDAOProtocolSettingsNetwork,
    RocketDAOSecurityProposals,
    RocketNetworkRevenues,
} from '../_utils/artifacts';
import * as assert from 'assert';
import { globalSnapShot } from '../_utils/snapshotting';
import { assertBN } from '../_helpers/bn';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketDAOSecurity', () => {
        let owner,
            securityMember1,
            securityMember2,
            securityMember3,
            random;

        let voteDelayTime;
        let votePhase1Time;
        let votePhase2Time;
        let leaveTime;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                securityMember1,
                securityMember2,
                securityMember3,
                random,
            ] = await ethers.getSigners();

            await userDeposit({ from: random, value: '320'.ether });

            voteDelayTime = await getDaoProtocolVoteDelayTime();
            votePhase1Time = await getDaoProtocolVotePhase1Time();
            votePhase2Time = await getDaoProtocolVotePhase2Time();
            leaveTime = await getDaoProtocolSecurityLeaveTime();
        });

        it(printTitle('random', 'can not accept a non-existent invite'), async () => {
            // Accept the invitation
            await shouldRevert(daoSecurityMemberJoin({ from: random }), 'Was able to accept invite', 'This address has not been invited to join');
        });

        it(printTitle('security member', 'can accept a valid invite'), async () => {
            // Invite via bootstrap
            await setDAOProtocolBootstrapSecurityInvite('Member 1', securityMember1, { from: owner });
            // Accept the invitation
            await daoSecurityMemberJoin({ from: securityMember1 });
        });

        it(printTitle('security member', 'can not leave without requesting and waiting required period'), async () => {
            // Invite via bootstrap
            await setDAOProtocolBootstrapSecurityInvite('Member 1', securityMember1, { from: owner });
            // Accept the invitation
            await daoSecurityMemberJoin({ from: securityMember1 });
            // Try to leave
            await shouldRevert(daoSecurityMemberLeave({ from: securityMember1 }), 'Was able to leave', 'This member has not been approved to leave or request has expired, please apply to leave again');
        });

        it(printTitle('security member', 'can leave after waiting required period'), async () => {
            // Invite via bootstrap
            await setDAOProtocolBootstrapSecurityInvite('Member 1', securityMember1, { from: owner });
            // Accept the invitation
            await daoSecurityMemberJoin({ from: securityMember1 });
            // Request leave
            await daoSecurityMemberRequestLeave({ from: securityMember1 });
            // Fail to leave
            await shouldRevert(daoSecurityMemberLeave({ from: securityMember1 }), 'Was able to leave', 'Member has not waited required time to leave');
            // Wait required time
            await helpers.time.increase(leaveTime + 1);
            // Successfully leave
            await daoSecurityMemberLeave({ from: securityMember1 });
        });

        describe('With Existing Council', () => {
            let rocketDAOSecurityProposals;

            before(async () => {
                // Preload contracts
                rocketDAOSecurityProposals = await RocketDAOSecurityProposals.deployed();

                // Set up a council of 3 members
                await setDAOProtocolBootstrapSecurityInvite('Member 1', securityMember1, { from: owner });
                await setDAOProtocolBootstrapSecurityInvite('Member 2', securityMember2, { from: owner });
                await setDAOProtocolBootstrapSecurityInvite('Member 3', securityMember3, { from: owner });
                await daoSecurityMemberJoin({ from: securityMember1 });
                await daoSecurityMemberJoin({ from: securityMember2 });
                await daoSecurityMemberJoin({ from: securityMember3 });
            })

            it(printTitle('security member', 'can propose and execute a valid setting change'), async () => {
                // Raise a proposal to disable deposits
                let proposalCalldata = rocketDAOSecurityProposals.interface.encodeFunctionData('proposalSettingBool', ['deposit', 'deposit.enabled', false]);
                // Add the proposal
                let proposalId = await daoSecurityPropose('Disable deposits urgently', proposalCalldata, {
                    from: securityMember1,
                });
                // Vote in favour
                await daoSecurityVote(proposalId, true, { from: securityMember1 });
                await daoSecurityVote(proposalId, true, { from: securityMember2 });
                // Execute
                await daoSecurityExecute(proposalId, { from: securityMember2 });
                // Check result
                assert.equal(await getDepositSetting('DepositEnabled'), false, 'Deposits were not disabled');
            });

            it(printTitle('security member', 'can not execute a setting change on a non-approved setting path'), async () => {
                // Raise a proposal to increase deposit pool maximum to 10,000 ether
                let proposalCalldata = rocketDAOSecurityProposals.interface.encodeFunctionData('proposalSettingUint', ['deposit', 'deposit.pool.maximum', '10000'.ether]);
                // Add the proposal
                let proposalId = await daoSecurityPropose('I want more rETH!', proposalCalldata, {
                    from: securityMember1,
                });
                // Vote in favour
                await daoSecurityVote(proposalId, true, { from: securityMember1 });
                await daoSecurityVote(proposalId, true, { from: securityMember2 });
                // Execute
                await shouldRevert(daoSecurityExecute(proposalId, { from: securityMember2 }), 'Setting was changed', 'Setting is not modifiable by security council');
            });

            it(printTitle('security member', 'can not execute a proposal without quorum'), async () => {
                // Raise a proposal to disable deposits
                let proposalCalldata = rocketDAOSecurityProposals.interface.encodeFunctionData('proposalSettingBool', ['deposit', 'deposit.enabled', false]);
                // Add the proposal
                let proposalId = await daoSecurityPropose('Disable deposits urgently', proposalCalldata, {
                    from: securityMember1,
                });
                // Vote in favour
                await daoSecurityVote(proposalId, true, { from: securityMember1 });
                // Fail to execute
                await shouldRevert(daoSecurityExecute(proposalId, { from: securityMember2 }), 'Proposal was executed', 'Proposal has not succeeded, has expired or has already been executed');
            });

            it(printTitle('security member', 'can adjust the node commission share security council adder'), async () => {
                // Get contracts
                const rocketNetworkRevenues = await RocketNetworkRevenues.deployed();
                const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
                // Raise a proposal to disable deposits
                const adder = '0.005'.ether;
                let proposalCalldata = rocketDAOSecurityProposals.interface.encodeFunctionData('proposalSettingUint', ['network', 'network.node.commission.share.security.council.adder', adder]);
                // Add the proposal
                let proposalId = await daoSecurityPropose('Adjust node commission share security council adder', proposalCalldata, {
                    from: securityMember1,
                });
                // Vote in favour
                await daoSecurityVote(proposalId, true, { from: securityMember1 });
                await daoSecurityVote(proposalId, true, { from: securityMember2 });
                // Execute and check
                await daoSecurityExecute(proposalId, { from: securityMember2 });
                // Check node share
                const effectiveNodeShare = await rocketDAOProtocolSettingsNetwork.getEffectiveNodeShare();
                assertBN.equal(effectiveNodeShare, '0.05'.ether + adder);
                const nodeShare = await rocketNetworkRevenues.getCurrentNodeShare();
                assertBN.equal(nodeShare, '0.05'.ether + adder);
                // Check voter share
                const effectiveVoterShare = await rocketDAOProtocolSettingsNetwork.getEffectiveVoterShare();
                assertBN.equal(effectiveVoterShare, '0.09'.ether - adder);
                const voterShare = await rocketNetworkRevenues.getCurrentVoterShare();
                assertBN.equal(voterShare, '0.09'.ether - adder);
            });
        });
    });
}
