// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISablierV2LockupLinear} from "../interfaces/ISablierV2LockupLinear.sol";

/// @title OVRFLOLens
/// @notice Deployed read-only periphery that hydrates an owner's OVRFLO Streams in one call.
/// @dev The shared lockup is an immutable constructor binding. The factory does not store this
///      address. Deployment truth verifies `lockup() == factory.ovrfloStream()`.
///
///      Owner enumeration hydrates every id from `tokensOfOwnerIn` in the same EVM execution.
///      A reverting id fails the whole call. There is no per-row `ok` flag.
///
///      `isDepleted` and `wasCanceled` copy `getStream` fields. `status` is the raw `statusOf`
///      result. DEPLETED takes precedence in that enum, so a canceled-then-emptied stream
///      reports `status == DEPLETED` and still has `wasCanceled == true`.
contract OVRFLOLens {
    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @dev Constructor lockup was the zero address.
    error ZeroAddress();
    /// @dev Window indices are `[start, stop)`. The fork rejects `start >= stop`.
    error SablierV2Lockup_InvalidQueryRange();

    /*//////////////////////////////////////////////////////////////
                                IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Shared OVRFLO Streams lockup. Verified against `factory.ovrfloStream()`.
    ISablierV2LockupLinear public immutable lockup;

    /// @notice One hydrated stream. Flattened `getStream` amounts plus owner, withdrawable,
    ///         status, and stream-field flags.
    struct StreamView {
        uint256 streamId;
        address owner;
        address sender;
        IERC20 asset;
        uint40 startTime;
        uint40 cliffTime;
        uint40 endTime;
        uint128 deposited;
        uint128 withdrawn;
        uint128 refunded;
        uint128 withdrawableAmount;
        uint8 status;
        bool isCancelable;
        bool isDepleted;
        bool wasCanceled;
    }

    constructor(address lockup_) {
        if (lockup_ == address(0)) revert ZeroAddress();
        lockup = ISablierV2LockupLinear(lockup_);
    }

    /*//////////////////////////////////////////////////////////////
                               READS
    //////////////////////////////////////////////////////////////*/

    /// @notice Complete set for `owner`. `total` is the unfiltered ERC-721 owner balance.
    /// @dev Returns `(0, [])` when `balanceOf` is zero. Does not call `tokensOfOwnerIn(0, 0)`.
    function streamsOfOwner(address owner) external view returns (uint256 total, StreamView[] memory streams) {
        total = lockup.balanceOf(owner);
        if (total == 0) {
            return (0, new StreamView[](0));
        }
        streams = _hydrateIds(lockup.tokensOfOwnerIn(owner, 0, total));
    }

    /// @notice Windowed hydration for enumeration indices `[start, stop)`.
    /// @dev Rejects `start >= stop`. Clamps an oversized stop to `total`. Returns empty
    ///      streams when `start` is at or past `total`.
    function streamsOfOwnerIn(address owner, uint256 start, uint256 stop)
        external
        view
        returns (uint256 total, StreamView[] memory streams)
    {
        if (start >= stop) revert SablierV2Lockup_InvalidQueryRange();
        total = lockup.balanceOf(owner);
        if (start >= total) {
            return (total, new StreamView[](0));
        }
        if (stop > total) {
            stop = total;
        }
        streams = _hydrateIds(lockup.tokensOfOwnerIn(owner, start, stop));
    }

    /*//////////////////////////////////////////////////////////////
                              INTERNALS
    //////////////////////////////////////////////////////////////*/

    function _hydrateIds(uint256[] memory ids) internal view returns (StreamView[] memory views) {
        uint256 n = ids.length;
        views = new StreamView[](n);
        for (uint256 i; i < n; ++i) {
            views[i] = _hydrateOne(ids[i]);
        }
    }

    function _hydrateOne(uint256 streamId) internal view returns (StreamView memory row) {
        ISablierV2LockupLinear.Stream memory stream = lockup.getStream(streamId);
        row.streamId = streamId;
        row.owner = lockup.ownerOf(streamId);
        row.sender = stream.sender;
        row.asset = stream.asset;
        row.startTime = stream.startTime;
        row.cliffTime = stream.cliffTime;
        row.endTime = stream.endTime;
        row.deposited = stream.amounts.deposited;
        row.withdrawn = stream.amounts.withdrawn;
        row.refunded = stream.amounts.refunded;
        row.withdrawableAmount = lockup.withdrawableAmountOf(streamId);
        row.status = uint8(lockup.statusOf(streamId));
        row.isCancelable = stream.isCancelable;
        row.isDepleted = stream.isDepleted;
        row.wasCanceled = stream.wasCanceled;
    }
}
