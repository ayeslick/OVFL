// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {OVRFLO} from "../src/OVRFLO.sol";
import {OVRFLOFactory} from "../src/OVRFLOFactory.sol";
import {OVRFLOLens} from "../src/OVRFLOLens.sol";
import {ISablierV2LockupLinear} from "../interfaces/ISablierV2LockupLinear.sol";
import {OVRFLOTestFixtures} from "../script/lib/OVRFLOTestFixtures.sol";
import {TestERC20} from "./mocks/TestERC20.sol";

/// @dev Artifact-ABI scalars the hand-kept lockup interface omits.
interface ILockupWasCanceled {
    function wasCanceled(uint256 streamId) external view returns (bool);
}

/// @dev Fixture-only. Production vault `deposit` keeps `cancelable: false`.
interface ILockupCancel {
    function cancel(uint256 streamId) external;
}

/// @notice Deployed lens suite against committed OVRFLOStream bytecode.
/// @dev Never MockSablier. Streams are minted by pranking the registered vault.
contract OVRFLOLensTest is OVRFLOTestFixtures, Test {
    uint256 internal constant EIP170_RUNTIME_CAP = 24_576;
    uint256 internal constant EIP3860_INITCODE_CAP = 49_152;
    uint128 internal constant DEPOSIT = 1 ether;
    uint40 internal constant DURATION = 30 days;
    uint256 internal constant FIXTURE_COUNT = 5;
    bytes4 internal constant INVALID_QUERY_RANGE = bytes4(keccak256("SablierV2Lockup_InvalidQueryRange()"));

    OVRFLOLens internal lens;
    ISablierV2LockupLinear internal lockup;
    OVRFLO internal vault;
    TestERC20 internal asset;
    address internal holder;
    uint256[] internal fixtureIds;

    function setUp() public {
        holder = makeAddr("holder");
        asset = new TestERC20("Lens Asset", "LAST");

        vm.startPrank(OWNER);
        OVRFLOFactory factory = new OVRFLOFactory(OWNER, address(ORACLE));
        (,, address stream) = _deployStreamLayer(address(factory));
        factory.setOvrfloStream(stream);
        vault = new OVRFLO(
            address(factory), TREASURY, address(asset), "OVRFLO Lens Asset", "ovrfloLAST", address(ORACLE), stream
        );
        factory.registerOvrflo(address(vault));
        vm.stopPrank();

        lockup = ISablierV2LockupLinear(stream);
        lens = new OVRFLOLens(stream);
        fixtureIds = _mintStreams(holder, FIXTURE_COUNT, false);
    }

    function test_Constructor_ZeroLockup_Reverts() public {
        vm.expectRevert(OVRFLOLens.ZeroAddress.selector);
        new OVRFLOLens(address(0));
    }

    function test_Lockup_EqualsBoundStream() public view {
        assertEq(address(lens.lockup()), address(lockup));
    }

    /*//////////////////////////////////////////////////////////////
                          FIELD AGREEMENT
    //////////////////////////////////////////////////////////////*/

    function test_Hydrate_AgreesWithDirectLockupReads() public view {
        uint256 id = fixtureIds[0];
        (, OVRFLOLens.StreamView[] memory rows) = lens.streamsOfOwner(holder);
        _assertAgreesWithDirect(rows[0], id, holder);
    }

    function test_Hydrate_DepletedStream_IsDepletedTrueWasCanceledFalse() public {
        uint256 id = fixtureIds[0];
        _deplete(id, holder);
        assertEq(uint8(lockup.statusOf(id)), uint8(ISablierV2LockupLinear.Status.DEPLETED));
        assertTrue(lockup.isDepleted(id));
        assertFalse(ILockupWasCanceled(address(lockup)).wasCanceled(id));

        (, OVRFLOLens.StreamView[] memory rows) = lens.streamsOfOwner(holder);
        OVRFLOLens.StreamView memory row = _rowById(rows, id);
        _assertAgreesWithDirect(row, id, holder);
        assertTrue(row.isDepleted);
        assertFalse(row.wasCanceled);
        assertEq(uint256(row.status), uint256(uint8(ISablierV2LockupLinear.Status.DEPLETED)));
    }

    /// @notice Fixture-only cancelable mint. Production `deposit` stays non-cancelable.
    function test_Hydrate_CanceledThenDepleted_WasCanceledTrue() public {
        address recipient = makeAddr("cancelable");
        uint256[] memory ids = _mintStreams(recipient, 1, true);
        uint256 id = ids[0];
        assertTrue(lockup.isCancelable(id));

        vm.prank(address(vault));
        ILockupCancel(address(lockup)).cancel(id);
        assertTrue(ILockupWasCanceled(address(lockup)).wasCanceled(id));

        _deplete(id, recipient);
        assertEq(uint8(lockup.statusOf(id)), uint8(ISablierV2LockupLinear.Status.DEPLETED));
        assertTrue(lockup.isDepleted(id));
        assertTrue(ILockupWasCanceled(address(lockup)).wasCanceled(id));

        (, OVRFLOLens.StreamView[] memory rows) = lens.streamsOfOwner(recipient);
        OVRFLOLens.StreamView memory row = _rowById(rows, id);
        assertTrue(row.isDepleted);
        assertTrue(row.wasCanceled);
        assertEq(uint256(row.status), uint256(uint8(ISablierV2LockupLinear.Status.DEPLETED)));
        _assertAgreesWithDirect(row, id, recipient);
    }

    function test_Hydrate_CanceledStillStreaming_WasCanceledTrue() public {
        address recipient = makeAddr("canceled-live");
        uint256[] memory ids = _mintStreams(recipient, 1, true);
        uint256 id = ids[0];
        vm.warp(block.timestamp + 1 days);
        vm.prank(address(vault));
        ILockupCancel(address(lockup)).cancel(id);

        (, OVRFLOLens.StreamView[] memory rows) = lens.streamsOfOwner(recipient);
        OVRFLOLens.StreamView memory row = _rowById(rows, id);
        assertTrue(row.wasCanceled);
        assertFalse(row.isDepleted);
        assertEq(uint256(row.status), uint256(uint8(ISablierV2LockupLinear.Status.CANCELED)));
        _assertAgreesWithDirect(row, id, recipient);
    }

    function test_StreamsOfOwner_EqualsWindowConcatenation() public view {
        (uint256 total, OVRFLOLens.StreamView[] memory full) = lens.streamsOfOwner(holder);
        (, OVRFLOLens.StreamView[] memory a) = lens.streamsOfOwnerIn(holder, 0, 2);
        (, OVRFLOLens.StreamView[] memory b) = lens.streamsOfOwnerIn(holder, 2, 4);
        (, OVRFLOLens.StreamView[] memory c) = lens.streamsOfOwnerIn(holder, 4, 5);
        assertEq(total, FIXTURE_COUNT);
        assertEq(full.length, a.length + b.length + c.length);
        _assertRowsEqual(full[0], a[0]);
        _assertRowsEqual(full[1], a[1]);
        _assertRowsEqual(full[2], b[0]);
        _assertRowsEqual(full[3], b[1]);
        _assertRowsEqual(full[4], c[0]);
    }

    function test_TransferredStream_MovesOwnerEnumeration() public {
        uint256 id = fixtureIds[0];
        address other = makeAddr("other");
        vm.prank(holder);
        lockup.transferFrom(holder, other, id);

        (uint256 holderTotal, OVRFLOLens.StreamView[] memory holderRows) = lens.streamsOfOwner(holder);
        (uint256 otherTotal, OVRFLOLens.StreamView[] memory otherRows) = lens.streamsOfOwner(other);
        assertEq(holderTotal, FIXTURE_COUNT - 1);
        assertEq(otherTotal, 1);
        assertEq(otherRows[0].streamId, id);
        assertEq(otherRows[0].owner, other);
        for (uint256 i; i < holderRows.length; ++i) {
            assertTrue(holderRows[i].streamId != id);
        }
    }

    /*//////////////////////////////////////////////////////////////
                          RANGE SEMANTICS
    //////////////////////////////////////////////////////////////*/

    function test_StreamsOfOwner_EmptyOwner_ReturnsZeroTotal() public {
        (uint256 total, OVRFLOLens.StreamView[] memory rows) = lens.streamsOfOwner(makeAddr("empty"));
        assertEq(total, 0);
        assertEq(rows.length, 0);
    }

    function test_StreamsOfOwnerIn_ExactPageAndClampedWindow() public view {
        (uint256 total, OVRFLOLens.StreamView[] memory exact) = lens.streamsOfOwnerIn(holder, 0, FIXTURE_COUNT);
        assertEq(total, FIXTURE_COUNT);
        assertEq(exact.length, FIXTURE_COUNT);

        (, OVRFLOLens.StreamView[] memory first) = lens.streamsOfOwnerIn(holder, 0, 2);
        assertEq(first.length, 2);
        assertEq(first[0].streamId, fixtureIds[0]);
        assertEq(first[1].streamId, fixtureIds[1]);

        (, OVRFLOLens.StreamView[] memory rest) = lens.streamsOfOwnerIn(holder, 2, FIXTURE_COUNT);
        assertEq(rest.length, 3);
        assertEq(rest[0].streamId, fixtureIds[2]);

        (, OVRFLOLens.StreamView[] memory clamped) = lens.streamsOfOwnerIn(holder, 0, 100);
        assertEq(clamped.length, FIXTURE_COUNT);

        (uint256 pastTotal, OVRFLOLens.StreamView[] memory pastEnd) =
            lens.streamsOfOwnerIn(holder, FIXTURE_COUNT, FIXTURE_COUNT + 5);
        assertEq(pastTotal, FIXTURE_COUNT);
        assertEq(pastEnd.length, 0);
    }

    function test_StreamsOfOwnerIn_InvalidRange_Reverts() public {
        vm.expectRevert(INVALID_QUERY_RANGE);
        lens.streamsOfOwnerIn(holder, 1, 1);

        vm.expectRevert(INVALID_QUERY_RANGE);
        lens.streamsOfOwnerIn(holder, 5, 2);
    }

    function test_StreamsOfOwner_AfterBurn_DropsIdAndKeepsTotal() public {
        uint256 burnedId = fixtureIds[1];
        _depleteAndBurn(burnedId, holder);

        (uint256 total, OVRFLOLens.StreamView[] memory rows) = lens.streamsOfOwner(holder);
        assertEq(total, FIXTURE_COUNT - 1);
        assertEq(rows.length, FIXTURE_COUNT - 1);
        for (uint256 i; i < rows.length; ++i) {
            assertTrue(rows[i].streamId != burnedId);
            _assertAgreesWithDirect(rows[i], rows[i].streamId, holder);
        }
    }

    /*//////////////////////////////////////////////////////////////
                         SIZE AND GAS GATES
    //////////////////////////////////////////////////////////////*/

    function test_Initcode_FitsEip3860() public {
        uint256 size = vm.getCode("OVRFLOLens.sol:OVRFLOLens").length;
        emit log_named_uint("OVRFLOLens initcode bytes", size);
        assertLe(size, EIP3860_INITCODE_CAP);
    }

    function test_Runtime_FitsEip170() public {
        uint256 size = vm.getDeployedCode("OVRFLOLens.sol:OVRFLOLens").length;
        emit log_named_uint("OVRFLOLens runtime bytes", size);
        assertLe(size, EIP170_RUNTIME_CAP);
    }

    function test_Gas_WindowSizes_OneTwentyFiveFifty() public {
        uint256 g1 = _measureOwnerWindow(makeAddr("gas1"), 1);
        uint256 g25 = _measureOwnerWindow(makeAddr("gas25"), 25);
        uint256 g50 = _measureOwnerWindow(makeAddr("gas50"), 50);
        emit log_named_uint("lens gas n=1", g1);
        emit log_named_uint("lens gas n=25", g25);
        emit log_named_uint("lens gas n=50", g50);
        assertGt(g1, 0);
        assertGt(g25, g1);
        assertGt(g50, g25);
    }

    function test_StreamsOfOwner_MemoryAtFiveHundredIds() public {
        address whale = makeAddr("whale");
        uint256[] memory ids = _mintStreams(whale, 500, false);
        (uint256 total, OVRFLOLens.StreamView[] memory rows) = lens.streamsOfOwner(whale);
        assertEq(total, 500);
        assertEq(rows.length, 500);
        assertEq(rows[0].owner, whale);
        assertEq(rows[499].owner, whale);
        assertEq(rows[0].streamId, ids[0]);
        assertEq(rows[499].streamId, ids[499]);
    }

    /*//////////////////////////////////////////////////////////////
                              HELPERS
    //////////////////////////////////////////////////////////////*/

    function _mintStreams(address recipient, uint256 n, bool cancelable) internal returns (uint256[] memory ids) {
        ids = new uint256[](n);
        asset.mint(address(vault), n * uint256(DEPOSIT));
        vm.startPrank(address(vault));
        asset.approve(address(lockup), type(uint256).max);
        for (uint256 i; i < n; ++i) {
            ids[i] = lockup.createWithDurations(
                ISablierV2LockupLinear.CreateWithDurations({
                    sender: address(vault),
                    recipient: recipient,
                    totalAmount: DEPOSIT,
                    asset: IERC20(address(asset)),
                    cancelable: cancelable,
                    transferable: true,
                    durations: ISablierV2LockupLinear.Durations({cliff: 0, total: DURATION}),
                    broker: ISablierV2LockupLinear.Broker({account: address(0), fee: 0})
                })
            );
        }
        vm.stopPrank();
    }

    function _deplete(uint256 streamId, address nftOwner) internal {
        vm.warp(lockup.getEndTime(streamId));
        uint128 amount = lockup.withdrawableAmountOf(streamId);
        if (amount == 0) return;
        vm.prank(nftOwner);
        lockup.withdraw(streamId, nftOwner, amount);
    }

    function _depleteAndBurn(uint256 streamId, address nftOwner) internal {
        _deplete(streamId, nftOwner);
        vm.prank(nftOwner);
        lockup.burn(streamId);
    }

    function _measureOwnerWindow(address recipient, uint256 n) internal returns (uint256 gasUsed) {
        _mintStreams(recipient, n, false);
        uint256 start = gasleft();
        (uint256 total, OVRFLOLens.StreamView[] memory rows) = lens.streamsOfOwner(recipient);
        gasUsed = start - gasleft();
        assertEq(total, n);
        assertEq(rows.length, n);
    }

    function _rowById(OVRFLOLens.StreamView[] memory rows, uint256 id)
        internal
        pure
        returns (OVRFLOLens.StreamView memory row)
    {
        for (uint256 i; i < rows.length; ++i) {
            if (rows[i].streamId == id) return rows[i];
        }
        revert("id missing from lens rows");
    }

    function _assertAgreesWithDirect(OVRFLOLens.StreamView memory row, uint256 id, address expectedOwner)
        internal
        view
    {
        ISablierV2LockupLinear.Stream memory stream = lockup.getStream(id);
        uint8 status = uint8(lockup.statusOf(id));
        assertEq(row.streamId, id);
        assertEq(row.owner, expectedOwner);
        assertEq(row.owner, lockup.ownerOf(id));
        assertEq(row.sender, stream.sender);
        assertEq(address(row.asset), address(stream.asset));
        assertEq(uint256(row.startTime), uint256(stream.startTime));
        assertEq(uint256(row.cliffTime), uint256(stream.cliffTime));
        assertEq(uint256(row.endTime), uint256(stream.endTime));
        assertEq(uint256(row.deposited), uint256(stream.amounts.deposited));
        assertEq(uint256(row.withdrawn), uint256(stream.amounts.withdrawn));
        assertEq(uint256(row.refunded), uint256(stream.amounts.refunded));
        assertEq(uint256(row.withdrawableAmount), uint256(lockup.withdrawableAmountOf(id)));
        assertEq(uint256(row.status), uint256(status));
        assertEq(row.isCancelable, stream.isCancelable);
        assertEq(row.isDepleted, stream.isDepleted);
        assertEq(row.wasCanceled, stream.wasCanceled);
        assertEq(row.isDepleted, lockup.isDepleted(id));
        assertEq(row.wasCanceled, ILockupWasCanceled(address(lockup)).wasCanceled(id));
    }

    function _assertRowsEqual(OVRFLOLens.StreamView memory a, OVRFLOLens.StreamView memory b) internal pure {
        assertEq(a.streamId, b.streamId);
        assertEq(a.owner, b.owner);
        assertEq(a.sender, b.sender);
        assertEq(address(a.asset), address(b.asset));
        assertEq(uint256(a.startTime), uint256(b.startTime));
        assertEq(uint256(a.cliffTime), uint256(b.cliffTime));
        assertEq(uint256(a.endTime), uint256(b.endTime));
        assertEq(uint256(a.deposited), uint256(b.deposited));
        assertEq(uint256(a.withdrawn), uint256(b.withdrawn));
        assertEq(uint256(a.refunded), uint256(b.refunded));
        assertEq(uint256(a.withdrawableAmount), uint256(b.withdrawableAmount));
        assertEq(uint256(a.status), uint256(b.status));
        assertEq(a.isCancelable, b.isCancelable);
        assertEq(a.isDepleted, b.isDepleted);
        assertEq(a.wasCanceled, b.wasCanceled);
    }
}
