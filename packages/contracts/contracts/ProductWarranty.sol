// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProductWarranty {
    enum Role {
        Manufacturer,
        Retailer,
        ServiceCenter
    }

    enum OwnershipStage {
        Manufacturer,
        Retailer,
        Customer
    }

    enum ProblemType {
        Screen,
        Battery,
        Software,
        Other
    }

    enum ClaimStatus {
        None,
        Pending,
        Rejected,
        Approved,
        Serviced,
        CancelledByTransfer
    }

    enum ServiceResult {
        None,
        Repaired,
        Replaced,
        Refunded,
        Other
    }

    struct Product {
        string productId;
        string serialNumber;
        string model;
        address manufacturer;
        address currentOwner;
        uint64 registeredAt;
        uint64 warrantyDuration;
        uint64 maxClaims;
        uint64 approvedClaims;
        uint64 warrantyStart;
        uint64 warrantyEnd;
        OwnershipStage stage;
        bool exists;
    }

    struct PendingTransfer {
        address from;
        address to;
        uint64 deadline;
        OwnershipStage nextStage;
        bool exists;
    }

    struct Claim {
        uint256 id;
        address applicantOwner;
        ProblemType problemType;
        uint64 submittedAt;
        ClaimStatus status;
        address processedBy;
        uint64 processedAt;
        address servicedBy;
        uint64 servicedAt;
        ServiceResult serviceResult;
    }

    error NotAdmin();
    error NotManufacturer();
    error NotServiceCenter();
    error Unauthorized();
    error EmptyValue();
    error InvalidAddress();
    error InvalidWarranty();
    error AlreadyRegistered();
    error ProductNotFound();
    error NotCurrentOwner();
    error InvalidRolePath();
    error TransferAlreadyPending();
    error TransferNotFound();
    error TransferExpired();
    error NotTransferRecipient();
    error InvalidEnumValue();
    error InvalidTimeout();
    error ClaimAlreadyPending();
    error ClaimNotFound();
    error InvalidClaimStatus();
    error WarrantyUnavailable();
    error ClaimOwnerChanged();

    address public immutable admin;
    uint64 public transferTimeout;

    mapping(address => bool) public isManufacturer;
    mapping(address => bool) public isRetailer;
    mapping(address => bool) public isServiceCenter;

    mapping(bytes32 => Product) private products;
    mapping(bytes32 => bool) private usedProductIds;
    mapping(bytes32 => bool) private usedSerialNumbers;
    mapping(bytes32 => PendingTransfer) private pendingTransfers;
    mapping(bytes32 => mapping(uint256 => Claim)) private claims;
    mapping(bytes32 => uint256[]) private claimIds;
    mapping(bytes32 => uint256) private nextClaimIds;
    mapping(bytes32 => uint256) private pendingClaimIds;

    event RoleUpdated(address indexed account, Role indexed role, bool active);
    event TransferTimeoutUpdated(uint64 previousTimeout, uint64 newTimeout);
    event ProductRegistered(
        bytes32 indexed productKey,
        string productId,
        string serialNumber,
        string model,
        address indexed manufacturer,
        uint64 registeredAt,
        uint64 warrantyDuration,
        uint64 maxClaims
    );
    event OwnershipTransferInitiated(
        bytes32 indexed productKey,
        address indexed from,
        address indexed to,
        OwnershipStage nextStage,
        uint64 deadline
    );
    event OwnershipTransferCancelled(bytes32 indexed productKey, address indexed cancelledBy);
    event OwnershipTransferRejected(bytes32 indexed productKey, address indexed rejectedBy);
    event OwnershipTransferExpired(bytes32 indexed productKey, address indexed cleanedBy);
    event OwnershipTransferred(
        bytes32 indexed productKey,
        address indexed from,
        address indexed to,
        OwnershipStage stage,
        uint64 transferredAt
    );
    event WarrantyActivated(bytes32 indexed productKey, uint64 startsAt, uint64 endsAt);
    event ClaimSubmitted(
        bytes32 indexed productKey,
        uint256 indexed claimId,
        address indexed applicantOwner,
        ProblemType problemType,
        uint64 submittedAt
    );
    event ClaimRejected(
        bytes32 indexed productKey,
        uint256 indexed claimId,
        address indexed serviceCenter,
        uint64 rejectedAt
    );
    event ClaimApproved(
        bytes32 indexed productKey,
        uint256 indexed claimId,
        address indexed serviceCenter,
        uint64 approvedAt,
        uint64 approvedClaims
    );
    event ClaimCancelledByTransfer(
        bytes32 indexed productKey,
        uint256 indexed claimId,
        address indexed cancelledBy,
        uint64 cancelledAt
    );
    event ClaimServiced(
        bytes32 indexed productKey,
        uint256 indexed claimId,
        address indexed serviceCenter,
        ServiceResult result,
        uint64 servicedAt
    );

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyManufacturer() {
        if (!isManufacturer[msg.sender]) revert NotManufacturer();
        _;
    }

    modifier onlyServiceCenter() {
        if (!isServiceCenter[msg.sender]) revert NotServiceCenter();
        _;
    }

    constructor() {
        admin = msg.sender;
        transferTimeout = 10 minutes;
    }

    function addManufacturer(address account) external onlyAdmin {
        _setRole(account, Role.Manufacturer, true);
    }

    function removeManufacturer(address account) external onlyAdmin {
        _setRole(account, Role.Manufacturer, false);
    }

    function addRetailer(address account) external onlyAdmin {
        _setRole(account, Role.Retailer, true);
    }

    function removeRetailer(address account) external onlyAdmin {
        _setRole(account, Role.Retailer, false);
    }

    function addServiceCenter(address account) external onlyAdmin {
        _setRole(account, Role.ServiceCenter, true);
    }

    function removeServiceCenter(address account) external onlyAdmin {
        _setRole(account, Role.ServiceCenter, false);
    }

    function setTransferTimeout(uint64 newTimeout) external onlyAdmin {
        if (newTimeout == 0) revert InvalidTimeout();
        uint64 previousTimeout = transferTimeout;
        transferTimeout = newTimeout;
        emit TransferTimeoutUpdated(previousTimeout, newTimeout);
    }

    function registerProduct(
        string calldata productId,
        string calldata serialNumber,
        string calldata model,
        uint64 warrantyDuration,
        uint64 maxClaims
    ) external onlyManufacturer returns (bytes32 productKey) {
        if (
            bytes(productId).length == 0 ||
            bytes(serialNumber).length == 0 ||
            bytes(model).length == 0
        ) revert EmptyValue();
        if (warrantyDuration == 0 || maxClaims == 0) revert InvalidWarranty();

        bytes32 productIdKey = keccak256(bytes(productId));
        bytes32 serialKey = keccak256(bytes(serialNumber));
        if (usedProductIds[productIdKey] || usedSerialNumbers[serialKey]) {
            revert AlreadyRegistered();
        }

        productKey = keccak256(abi.encode(productIdKey, serialKey));
        Product storage product = products[productKey];
        product.productId = productId;
        product.serialNumber = serialNumber;
        product.model = model;
        product.manufacturer = msg.sender;
        product.currentOwner = msg.sender;
        product.registeredAt = uint64(block.timestamp);
        product.warrantyDuration = warrantyDuration;
        product.maxClaims = maxClaims;
        product.stage = OwnershipStage.Manufacturer;
        product.exists = true;

        usedProductIds[productIdKey] = true;
        usedSerialNumbers[serialKey] = true;

        emit ProductRegistered(
            productKey,
            productId,
            serialNumber,
            model,
            msg.sender,
            product.registeredAt,
            warrantyDuration,
            maxClaims
        );
    }

    function getProductKey(
        string calldata productId,
        string calldata serialNumber
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(keccak256(bytes(productId)), keccak256(bytes(serialNumber))));
    }

    function getProduct(
        string calldata productId,
        string calldata serialNumber
    ) external view returns (Product memory) {
        return _getProduct(productId, serialNumber);
    }

    function getProductByKey(bytes32 productKey) external view returns (Product memory) {
        Product memory product = products[productKey];
        if (!product.exists) revert ProductNotFound();
        return product;
    }

    function initiateTransfer(
        string calldata productId,
        string calldata serialNumber,
        address recipient
    ) external {
        bytes32 productKey = getProductKey(productId, serialNumber);
        Product storage product = _getProductStorage(productKey);
        if (msg.sender != product.currentOwner) revert NotCurrentOwner();
        if (recipient == address(0) || recipient == msg.sender) revert InvalidAddress();
        if (pendingTransfers[productKey].exists) revert TransferAlreadyPending();

        OwnershipStage nextStage;
        if (product.stage == OwnershipStage.Manufacturer) {
            if (!isRetailer[recipient]) revert InvalidRolePath();
            nextStage = OwnershipStage.Retailer;
        } else if (_isInstitution(recipient)) {
            revert InvalidRolePath();
        } else {
            nextStage = OwnershipStage.Customer;
        }

        uint64 deadline = uint64(block.timestamp) + transferTimeout;
        pendingTransfers[productKey] = PendingTransfer({
            from: msg.sender,
            to: recipient,
            deadline: deadline,
            nextStage: nextStage,
            exists: true
        });

        emit OwnershipTransferInitiated(
            productKey,
            msg.sender,
            recipient,
            nextStage,
            deadline
        );
    }

    function cancelTransfer(string calldata productId, string calldata serialNumber) external {
        bytes32 productKey = getProductKey(productId, serialNumber);
        Product storage product = _getProductStorage(productKey);
        PendingTransfer storage transfer = pendingTransfers[productKey];
        if (!transfer.exists) revert TransferNotFound();
        if (msg.sender != product.currentOwner) revert NotCurrentOwner();

        delete pendingTransfers[productKey];
        emit OwnershipTransferCancelled(productKey, msg.sender);
    }

    function rejectTransfer(string calldata productId, string calldata serialNumber) external {
        bytes32 productKey = getProductKey(productId, serialNumber);
        PendingTransfer storage transfer = pendingTransfers[productKey];
        if (!transfer.exists) revert TransferNotFound();
        if (msg.sender != transfer.to) revert NotTransferRecipient();

        delete pendingTransfers[productKey];
        emit OwnershipTransferRejected(productKey, msg.sender);
    }

    function expireTransfer(string calldata productId, string calldata serialNumber) external {
        bytes32 productKey = getProductKey(productId, serialNumber);
        PendingTransfer storage transfer = pendingTransfers[productKey];
        if (!transfer.exists) revert TransferNotFound();
        if (block.timestamp <= transfer.deadline) revert TransferExpired();

        delete pendingTransfers[productKey];
        emit OwnershipTransferExpired(productKey, msg.sender);
    }

    function acceptTransfer(string calldata productId, string calldata serialNumber) external {
        bytes32 productKey = getProductKey(productId, serialNumber);
        Product storage product = _getProductStorage(productKey);
        PendingTransfer storage transfer = pendingTransfers[productKey];
        if (!transfer.exists) revert TransferNotFound();
        if (msg.sender != transfer.to) revert NotTransferRecipient();
        if (block.timestamp > transfer.deadline) revert TransferExpired();

        uint64 nowTimestamp = uint64(block.timestamp);
        uint256 pendingClaimId = pendingClaimIds[productKey];
        if (pendingClaimId != 0) {
            Claim storage claim = claims[productKey][pendingClaimId];
            if (claim.status == ClaimStatus.Pending) {
                claim.status = ClaimStatus.CancelledByTransfer;
                claim.processedBy = msg.sender;
                claim.processedAt = nowTimestamp;
                delete pendingClaimIds[productKey];
                emit ClaimCancelledByTransfer(
                    productKey,
                    pendingClaimId,
                    msg.sender,
                    nowTimestamp
                );
            }
        }

        address previousOwner = product.currentOwner;
        product.currentOwner = transfer.to;
        product.stage = transfer.nextStage;
        if (transfer.nextStage == OwnershipStage.Customer && product.warrantyStart == 0) {
            product.warrantyStart = nowTimestamp;
            product.warrantyEnd = nowTimestamp + product.warrantyDuration;
            emit WarrantyActivated(productKey, product.warrantyStart, product.warrantyEnd);
        }

        delete pendingTransfers[productKey];
        emit OwnershipTransferred(
            productKey,
            previousOwner,
            product.currentOwner,
            product.stage,
            nowTimestamp
        );
    }

    function getPendingTransfer(
        string calldata productId,
        string calldata serialNumber
    ) external view returns (PendingTransfer memory) {
        bytes32 productKey = getProductKey(productId, serialNumber);
        if (!products[productKey].exists) revert ProductNotFound();
        return pendingTransfers[productKey];
    }

    function submitClaim(
        string calldata productId,
        string calldata serialNumber,
        ProblemType problemType
    ) external returns (uint256 claimId) {
        bytes32 productKey = getProductKey(productId, serialNumber);
        Product storage product = _getProductStorage(productKey);
        if (msg.sender != product.currentOwner) revert NotCurrentOwner();
        if (uint8(problemType) > uint8(ProblemType.Other)) revert InvalidEnumValue();
        if (!_warrantyAvailable(product)) revert WarrantyUnavailable();
        if (pendingClaimIds[productKey] != 0) revert ClaimAlreadyPending();

        claimId = nextClaimIds[productKey] + 1;
        nextClaimIds[productKey] = claimId;
        claims[productKey][claimId] = Claim({
            id: claimId,
            applicantOwner: msg.sender,
            problemType: problemType,
            submittedAt: uint64(block.timestamp),
            status: ClaimStatus.Pending,
            processedBy: address(0),
            processedAt: 0,
            servicedBy: address(0),
            servicedAt: 0,
            serviceResult: ServiceResult.None
        });
        claimIds[productKey].push(claimId);
        pendingClaimIds[productKey] = claimId;

        emit ClaimSubmitted(
            productKey,
            claimId,
            msg.sender,
            problemType,
            uint64(block.timestamp)
        );
    }

    function rejectClaim(string calldata productId, string calldata serialNumber, uint256 claimId)
        external
        onlyServiceCenter
    {
        bytes32 productKey = getProductKey(productId, serialNumber);
        Product storage product = _getProductStorage(productKey);
        Claim storage claim = _getClaimStorage(productKey, claimId);
        if (claim.status != ClaimStatus.Pending) revert InvalidClaimStatus();
        if (claim.applicantOwner != product.currentOwner) revert ClaimOwnerChanged();

        claim.status = ClaimStatus.Rejected;
        claim.processedBy = msg.sender;
        claim.processedAt = uint64(block.timestamp);
        delete pendingClaimIds[productKey];

        emit ClaimRejected(productKey, claimId, msg.sender, uint64(block.timestamp));
    }

    function approveClaim(string calldata productId, string calldata serialNumber, uint256 claimId)
        external
        onlyServiceCenter
    {
        bytes32 productKey = getProductKey(productId, serialNumber);
        Product storage product = _getProductStorage(productKey);
        Claim storage claim = _getClaimStorage(productKey, claimId);
        if (claim.status != ClaimStatus.Pending) revert InvalidClaimStatus();
        if (claim.applicantOwner != product.currentOwner) revert ClaimOwnerChanged();
        if (!_warrantyAvailable(product)) revert WarrantyUnavailable();

        claim.status = ClaimStatus.Approved;
        claim.processedBy = msg.sender;
        claim.processedAt = uint64(block.timestamp);
        product.approvedClaims += 1;
        delete pendingClaimIds[productKey];

        emit ClaimApproved(
            productKey,
            claimId,
            msg.sender,
            uint64(block.timestamp),
            product.approvedClaims
        );
    }

    function completeServicing(
        string calldata productId,
        string calldata serialNumber,
        uint256 claimId,
        ServiceResult result
    ) external {
        bytes32 productKey = getProductKey(productId, serialNumber);
        Claim storage claim = _getClaimStorage(productKey, claimId);
        if (claim.status != ClaimStatus.Approved) revert InvalidClaimStatus();
        if (!isServiceCenter[msg.sender] && msg.sender != claim.processedBy) {
            revert NotServiceCenter();
        }
        if (result == ServiceResult.None || uint8(result) > uint8(ServiceResult.Other)) {
            revert InvalidEnumValue();
        }

        claim.status = ClaimStatus.Serviced;
        claim.servicedBy = msg.sender;
        claim.servicedAt = uint64(block.timestamp);
        claim.serviceResult = result;

        emit ClaimServiced(
            productKey,
            claimId,
            msg.sender,
            result,
            uint64(block.timestamp)
        );
    }

    function getClaim(
        string calldata productId,
        string calldata serialNumber,
        uint256 claimId
    ) external view returns (Claim memory) {
        bytes32 productKey = getProductKey(productId, serialNumber);
        return _getClaim(productKey, claimId);
    }

    function getClaimIds(
        string calldata productId,
        string calldata serialNumber
    ) external view returns (uint256[] memory) {
        bytes32 productKey = getProductKey(productId, serialNumber);
        if (!products[productKey].exists) revert ProductNotFound();
        return claimIds[productKey];
    }

    function getPendingClaimId(
        string calldata productId,
        string calldata serialNumber
    ) external view returns (uint256) {
        bytes32 productKey = getProductKey(productId, serialNumber);
        if (!products[productKey].exists) revert ProductNotFound();
        return pendingClaimIds[productKey];
    }

    function _setRole(address account, Role role, bool active) private {
        if (account == address(0)) revert InvalidAddress();
        if (role == Role.Manufacturer) {
            isManufacturer[account] = active;
        } else if (role == Role.Retailer) {
            isRetailer[account] = active;
        } else {
            isServiceCenter[account] = active;
        }
        emit RoleUpdated(account, role, active);
    }

    function _isInstitution(address account) private view returns (bool) {
        return isManufacturer[account] || isRetailer[account] || isServiceCenter[account];
    }

    function _getProduct(
        string calldata productId,
        string calldata serialNumber
    ) private view returns (Product memory) {
        Product memory product = products[getProductKey(productId, serialNumber)];
        if (!product.exists) revert ProductNotFound();
        return product;
    }

    function _getProductStorage(bytes32 productKey)
        private
        view
        returns (Product storage product)
    {
        product = products[productKey];
        if (!product.exists) revert ProductNotFound();
    }

    function _getClaim(bytes32 productKey, uint256 claimId)
        private
        view
        returns (Claim memory)
    {
        Claim memory claim = claims[productKey][claimId];
        if (claim.id == 0) revert ClaimNotFound();
        return claim;
    }

    function _getClaimStorage(bytes32 productKey, uint256 claimId)
        private
        view
        returns (Claim storage claim)
    {
        claim = claims[productKey][claimId];
        if (claim.id == 0) revert ClaimNotFound();
    }

    function _warrantyAvailable(Product storage product) private view returns (bool) {
        return
            product.warrantyStart != 0 &&
            block.timestamp <= product.warrantyEnd &&
            product.approvedClaims < product.maxClaims;
    }
}
