// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

contract SXAdmin {
    struct Proposal {
        uint256 id;
        address target;
        bytes data;
        uint256 approvalCount;
        bool executed;
    }

    address[] public masterDevices;
    mapping(address => bool) public isMasterDevice;

    uint256 public proposalCounter;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public proposalApprovals;

    // Pausable target contracts
    address public sxpt;
    address public sxlt;
    address public sxls;

    bool public killSwitchActive;

    event DeviceRegistered(address indexed deviceAddress);
    event ProposalCreated(uint256 indexed proposalId, address indexed target);
    event ProposalApproved(uint256 indexed proposalId, address indexed approver);
    event ProposalExecuted(uint256 indexed proposalId);
    event KillSwitchActivated();
    event KillSwitchDeactivated();

    modifier onlyMasterDevice() {
        require(isMasterDevice[msg.sender], "SXAdmin: only master device");
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "SXAdmin: only self");
        _;
    }

    constructor(
        address _device1,
        address _device2,
        address _device3,
        address _sxpt,
        address _sxlt,
        address _sxls
    ) {
        require(_device1 != address(0) && _device2 != address(0) && _device3 != address(0), "SXAdmin: invalid address");
        _registerDevice(_device1);
        _registerDevice(_device2);
        _registerDevice(_device3);
        sxpt = _sxpt;
        sxlt = _sxlt;
        sxls = _sxls;
    }

    function _registerDevice(address _device) internal {
        require(!isMasterDevice[_device], "SXAdmin: device already registered");
        masterDevices.push(_device);
        isMasterDevice[_device] = true;
        emit DeviceRegistered(_device);
    }

    function registerMasterDevice(address deviceAddress) external onlySelf {
        require(deviceAddress != address(0), "SXAdmin: invalid address");
        _registerDevice(deviceAddress);
    }

    function createProposal(address target, bytes calldata data) external onlyMasterDevice returns (uint256) {
        proposalCounter++;
        uint256 propId = proposalCounter;

        proposals[propId] = Proposal({
            id: propId,
            target: target,
            data: data,
            approvalCount: 0,
            executed: false
        });

        emit ProposalCreated(propId, target);
        return propId;
    }

    function approveProposal(uint256 proposalId) external onlyMasterDevice {
        Proposal storage prop = proposals[proposalId];
        require(!prop.executed, "SXAdmin: already executed");
        require(!proposalApprovals[proposalId][msg.sender], "SXAdmin: already approved");

        proposalApprovals[proposalId][msg.sender] = true;
        prop.approvalCount++;

        emit ProposalApproved(proposalId, msg.sender);
    }

    function executeProposal(uint256 proposalId) external onlyMasterDevice {
        Proposal storage prop = proposals[proposalId];
        require(!prop.executed, "SXAdmin: already executed");
        require(prop.approvalCount >= masterDevices.length, "SXAdmin: insufficient approvals");

        prop.executed = true;

        (bool success, ) = prop.target.call(prop.data);
        require(success, "SXAdmin: execution failed");

        emit ProposalExecuted(proposalId);
    }

    function activateKillSwitch() external onlySelf {
        killSwitchActive = true;

        if (sxpt != address(0)) {
            (bool s1, ) = sxpt.call(abi.encodeWithSignature("setPaused(bool)", true));
            require(s1, "SXAdmin: pause SXPT failed");
        }
        if (sxlt != address(0)) {
            (bool s2, ) = sxlt.call(abi.encodeWithSignature("setPaused(bool)", true));
            require(s2, "SXAdmin: pause SXLT failed");
        }
        if (sxls != address(0)) {
            (bool s3, ) = sxls.call(abi.encodeWithSignature("setPaused(bool)", true));
            require(s3, "SXAdmin: pause SXLS failed");
        }

        emit KillSwitchActivated();
    }

    function deactivateKillSwitch() external onlySelf {
        killSwitchActive = false;

        if (sxpt != address(0)) {
            (bool s1, ) = sxpt.call(abi.encodeWithSignature("setPaused(bool)", false));
            require(s1, "SXAdmin: resume SXPT failed");
        }
        if (sxlt != address(0)) {
            (bool s2, ) = sxlt.call(abi.encodeWithSignature("setPaused(bool)", false));
            require(s2, "SXAdmin: resume SXLT failed");
        }
        if (sxls != address(0)) {
            (bool s3, ) = sxls.call(abi.encodeWithSignature("setPaused(bool)", false));
            require(s3, "SXAdmin: resume SXLS failed");
        }

        emit KillSwitchDeactivated();
    }
}
