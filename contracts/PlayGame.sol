// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PlayGame is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable gameToken;
    address public operator; // backend/operator who can commit results
    uint256 public refundTimeout = 24 hours;

    enum Status { NONE, CREATED, STAKED, SETTLED, REFUNDED }

    struct MatchInfo {
        bytes32 matchId;
        address p1;
        address p2;
        uint256 stake;        // stake in GT units (18 decimals)
        bool p1Staked;
        bool p2Staked;
        uint256 createdAt;
        uint256 startTime;    // when both staked
        Status status;
    }

    mapping(bytes32 => MatchInfo) public matches;

    event MatchCreated(bytes32 indexed matchId, address indexed p1, address indexed p2, uint256 stake);
    event Staked(bytes32 indexed matchId, address indexed player);
    event Settled(bytes32 indexed matchId, address indexed winner, uint256 amount);
    event Refunded(bytes32 indexed matchId);

    modifier onlyOperator() {
        require(msg.sender == operator, "PlayGame: only operator");
        _;
    }

    constructor(address _gameToken) {
        require(_gameToken != address(0), "PlayGame: zero token");
        gameToken = IERC20(_gameToken);
    }

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
    }

    function setRefundTimeout(uint256 _seconds) external onlyOwner {
        refundTimeout = _seconds;
    }

    function createMatch(bytes32 matchId, address p1, address p2, uint256 stake) external onlyOwner {
        require(matches[matchId].status == Status.NONE, "PlayGame: match exists");
        matches[matchId] = MatchInfo({
            matchId: matchId,
            p1: p1,
            p2: p2,
            stake: stake,
            p1Staked: false,
            p2Staked: false,
            createdAt: block.timestamp,
            startTime: 0,
            status: Status.CREATED
        });
        emit MatchCreated(matchId, p1, p2, stake);
    }

    // player calls stake after they approve PlayGame to spend GT
    function stake(bytes32 matchId) external nonReentrant {
        MatchInfo storage m = matches[matchId];
        require(m.status == Status.CREATED, "PlayGame: not open for staking");
        require(msg.sender == m.p1 || msg.sender == m.p2, "PlayGame: not a player");

        // ensure the caller hasn't already staked
        if (msg.sender == m.p1) {
            require(!m.p1Staked, "PlayGame: p1 already staked");
        } else {
            require(!m.p2Staked, "PlayGame: p2 already staked");
        }

        // pull exactly stake GT using SafeERC20
        IERC20(address(gameToken)).safeTransferFrom(msg.sender, address(this), m.stake);

        if (msg.sender == m.p1) m.p1Staked = true;
        else m.p2Staked = true;

        emit Staked(matchId, msg.sender);

        if (m.p1Staked && m.p2Staked) {
            m.status = Status.STAKED;
            m.startTime = block.timestamp;
        }
    }

    function commitResult(bytes32 matchId, address winner) external nonReentrant onlyOperator {
        MatchInfo storage m = matches[matchId];
        require(m.status == Status.STAKED, "PlayGame: not staked");
        require(winner == m.p1 || winner == m.p2, "PlayGame: invalid winner");

        // prevent double-commit
        m.status = Status.SETTLED;

        uint256 payout = m.stake * 2;

        // use SafeERC20 safeTransfer (will revert on failure)
        IERC20(address(gameToken)).safeTransfer(winner, payout);

        emit Settled(matchId, winner, payout);
    }

    function refund(bytes32 matchId) external nonReentrant {
        MatchInfo storage m = matches[matchId];
        require(m.status == Status.CREATED || m.status == Status.STAKED, "PlayGame: cannot refund");
        uint256 timeoutPoint = (m.status == Status.STAKED) ? (m.startTime + refundTimeout) : (m.createdAt + refundTimeout);
        require(block.timestamp >= timeoutPoint, "PlayGame: timeout not reached");

        // mark refunded before transfers (idempotency + CEI)
        m.status = Status.REFUNDED;

        // return stakes to whoever staked using SafeERC20
        if (m.p1Staked) {
            IERC20(address(gameToken)).safeTransfer(m.p1, m.stake);
        }
        if (m.p2Staked) {
            IERC20(address(gameToken)).safeTransfer(m.p2, m.stake);
        }

        emit Refunded(matchId);
    }
}
