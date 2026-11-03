
/*
===============================================================================
 Projet        : GestionsBoutiques
 SGBD          : Microsoft SQL Server
 Objet         : Modèle relationnel normalisé et évolutif
 Version       : 1.0
 Convention    :
   - Tables au singulier en PascalCase
   - PK : <NomTable>Id
   - FK : <TableReferencee>Id
   - Dates : DATETIME
   - Montants : MONNEY
   - Quantités : DECIMAL(18,3)
   - Booléens : BIT
   - Codes métier : VARCHAR+ contraintes UNIQUE
===============================================================================
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*==============================================================================
  0. CREATION BASE (OPTIONNEL)
==============================================================================*/
 CREATE DATABASE GestionsBoutiques;
 GO
 USE GestionsBoutiques;
GO

/*==============================================================================
  1. TABLES DE REFERENCE
==============================================================================*/

-- 1.1 Rôles utilisateurs
IF OBJECT_ID('dbo.tblRefRole' , 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefRole (
        roleId              INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcRole                VARCHAR(25) NOT NULL,
        vcDescription         VARCHAR(50) NULL,
        
        CONSTRAINT PK_RefRole PRIMARY KEY CLUSTERED (RoleId),
        CONSTRAINT UQ_RefRole_Code UNIQUE (vcCode)
    );
END;
GO

--1.2 Genre de J'utilisateur
IF OBJECT_ID('dbo.tblRefGender','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefGender (
        genderId            INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcGender                VARCHAR(25) NOT NULL,
       
        CONSTRAINT PK_RefGender PRIMARY KEY  (genderId),
        CONSTRAINT UQ_RefGender_Code UNIQUE (vcCode)
    );
END;
GO

--1.3 Type Clients
IF OBJECT_ID('dbo.tblRefCustomerType','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefCustomerType (
        customerTypeId      INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcCustomerType      VARCHAR(30) NOT NULL,
        vcDescription         VARCHAR(50) NULL,

        CONSTRAINT PK_RefCustomerType PRIMARY KEY (customerTypeId),
        CONSTRAINT UQ_RefCustomerType_Code UNIQUE (vcCode)
    );
END;
GO

--1.4 Type Boutiques
IF OBJECT_ID('dbo.tblRefStoreType','U') IS NULL

BEGIN
    CREATE TABLE dbo.tblRefStoreType (
        storeTypeId         INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcStoreType                VARCHAR(25) NOT NULL,
        vcDescription         VARCHAR(50) NULL,
        
        CONSTRAINT PK_RefStoreType PRIMARY KEY  (StoreTypeId),
        CONSTRAINT UQ_RefStoreType_Code UNIQUE (vcCode)
    );
END;
GO

--1.5 Methode Paiement 
IF OBJECT_ID('dbo.tblRefPaymentMethod','U') IS NULL

BEGIN
    CREATE TABLE dbo.tblRefPaymentMethod (
        paymentMethodId     INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcPaymentMethod               VARCHAR(25) NOT NULL,
       
        CONSTRAINT PK_RefPaymentMethod PRIMARY KEY  (paymentMethodId),
        CONSTRAINT UQ_RefPaymentMethod_Code UNIQUE (vcCode)
    );
END;
GO

-- 1.6 Status Paiement
IF OBJECT_ID('dbo.tblRefPaymentStatus','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefPaymentStatus (
        paymentStatusId     INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcPaymentStatus             VARCHAR(20) NOT NULL,
       
        CONSTRAINT PK_RefPaymentStatus PRIMARY KEY  (paymentStatusId),
        CONSTRAINT UQ_RefPaymentStatus_Code UNIQUE (vcCode)
    );
END;
GO

--1.7 Status  vente
IF OBJECT_ID('dbo.tblRefSaleStatus','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefSaleStatus (
        saleStatusId        INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcSaleStatus              VARCHAR(20) NOT NULL,
        
        CONSTRAINT PK_RefSaleStatus PRIMARY KEY  (saleStatusId),
        CONSTRAINT UQ_RefSaleStatus_Code UNIQUE (vcCode)
    );
END;
GO
-- 1.8 cataloguer les types de remises
IF OBJECT_ID('dbo.tblRefDiscountType','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefDiscountType (
        discountTypeId      INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcDiscountType                VARCHAR(30) NOT NULL,
       
        CONSTRAINT PK_RefDiscountType PRIMARY KEY  (discountTypeId),
        CONSTRAINT UQ_RefDiscountType_Code UNIQUE (vcCode)
    );
END;
GO

--1.9 status caisse
IF OBJECT_ID('dbo.tblRefCashSessionStatus','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefCashSessionStatus (
        cashSessionStatusId INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcCashSessionStatus             VARCHAR(30) NOT NULL,
  
        CONSTRAINT PK_RefCashSessionStatus PRIMARY KEY  (cashSessionStatusId),
        CONSTRAINT UQ_RefCashSessionStatus_Code UNIQUE (vcCode)
    );
END;
GO

--1.10 les differents types de mouvements de stock
IF OBJECT_ID('dbo.tblRefStockMovementType','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefStockMovementType (
        stockMovementTypeId INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcStockMovementType                VARCHAR(30) NOT NULL,
        direction           INT NOT NULL,
        vcDescription         VARCHAR(50) NULL,

        CONSTRAINT PK_RefStockMovementType PRIMARY KEY  (stockMovementTypeId),
        CONSTRAINT UQ_RefStockMovementType_StockMovementType UNIQUE (vcCode),
        CONSTRAINT CK_RefStockMovementType_direction CHECK (direction IN (-1, 0, 1))
    );
END;
GO

--1.11 status transfert interBoutique
IF OBJECT_ID('dbo.tblRefTransferStatus','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefTransferStatus (
        transferStatusId    INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcTransferStatus      VARCHAR(30) NOT NULL,
        
        CONSTRAINT PK_RefTransferStatus PRIMARY KEY  (transferStatusId),
        CONSTRAINT UQ_RefTransferStatus_Code UNIQUE (vcCode)
    );
END;
GO

--1.12 table de référence pour cataloguer les mouvements de stock impliquant des tiers (clients, fournisseurs, partenaires externes).
IF OBJECT_ID('dbo.tblRefThirdPartyMovementType','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefThirdPartyMovementType (
        thirdPartyMovementTypeId INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcThirdPartyMovementType  VARCHAR(30) NOT NULL,
        direction           INT NOT NULL,

        CONSTRAINT PK_RefThirdPartyMovementType PRIMARY KEY  (thirdPartyMovementTypeId),
        CONSTRAINT UQ_RefThirdPartyMovementType_Code UNIQUE (vcCode),
        CONSTRAINT CK_RefThirdPartyMovementType_Direction CHECK (direction IN (-1, 1))
    );
END;
GO
--1.13 motifs d’ajustement
IF OBJECT_ID('dbo.tblRefAdjustmentReason','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefAdjustmentReason (
        adjustmentReasonId  INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcAdjustmentReason    VARCHAR(30) NOT NULL,
        
        CONSTRAINT PK_RefAdjustmentReason PRIMARY KEY  (adjustmentReasonId),
        CONSTRAINT UQ_RefAdjustmentReason_Code UNIQUE (vcCode)
    );
END;
GO

--1.14 statuts possibles d’un ajustement
IF OBJECT_ID('dbo.tblRefAdjustmentStatus','U')IS NULL
CREATE TABLE dbo.tblRefAdjustmentStatus (
    adjustmentStatusId  INT IDENTITY(1,1) NOT NULL,
    vcCode                VARCHAR(20) NOT NULL,
    vcAdjustmentStatus    VARCHAR(30) NOT NULL,

    CONSTRAINT PK_RefAdjustmentStatus PRIMARY KEY (adjustmentStatusId),
    CONSTRAINT UQ_RefAdjustmentStatus_Code UNIQUE (vcCode)
);
GO

--1.15 statuts  rapport de caisse
IF OBJECT_ID('dbo.tblRefCashReportStatus','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefCashReportStatus (
        cashReportStatusId  INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcCashReportStatus                VARCHAR(30) NOT NULL,

        CONSTRAINT PK_RefCashReportStatus PRIMARY KEY  (cashReportStatusId),
        CONSTRAINT UQ_RefCashReportStatus_Code UNIQUE (vcCode)
    );
END;
GO
-- 1.16 statuts d’un achat
IF OBJECT_ID('dbo.tblRefPurchaseStatus','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefPurchaseStatus (
        purchaseStatusId    INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcPurchaseStatus       VARCHAR(30) NOT NULL,
        
        CONSTRAINT PK_RefPurchaseStatus PRIMARY KEY  (purchaseStatusId),
        CONSTRAINT UQ_RefPurchaseStatus_Code UNIQUE (vcCode)
    );
END;
GO

--1.17 statuts  d’un inventaire

IF OBJECT_ID('dbo.tblRefInventoryStatus','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefInventoryStatus (
        inventoryStatusId   INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcInventoryStatus                NVARCHAR(30) NOT NULL,

        CONSTRAINT PK_RefInventoryStatus PRIMARY KEY  (inventoryStatusId),
        CONSTRAINT UQ_RefInventoryStatus_Code UNIQUE (vcCode)
    );
END;
GO

-- 1.18 statuts d’une demande d’enregistrement
IF OBJECT_ID('dbo.tblRefRegistrationRequestStatus','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefRegistrationRequestStatus (
        registrationRequestStatusId INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcRegistrationRequestStatus            VARCHAR(30) NOT NULL,

        CONSTRAINT PK_RefRegistrationRequestStatus PRIMARY KEY  (RegistrationRequestStatusId),
        CONSTRAINT UQ_RefRegistrationRequestStatus_Code UNIQUE (vcCode)
    );
END;
GO

-- 1.19  unités de mesure 
IF OBJECT_ID('dbo.tblRefUnitOfMeasure','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefUnitOfMeasure (
        unitOfMeasureId     INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcUnitOfMeasure       VARCHAR(30) NOT NULL,
        vcSymbol              VARCHAR(10) NULL,
  
        CONSTRAINT PK_RefUnitOfMeasure PRIMARY KEY  (unitOfMeasureId),
        CONSTRAINT UQ_RefUnitOfMeasure_Code UNIQUE (vcCode)
    );
END;
GO
--1.20 types de comptes de trésorerie
IF OBJECT_ID('dbo.tblRefTreasuryAccountType','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefTreasuryAccountType (
        treasuryAccountTypeId INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcTreasuryAccountType VARCHAR(30) NOT NULL,
        
        CONSTRAINT PK_RefTreasuryAccountType PRIMARY KEY  (treasuryAccountTypeId),
        CONSTRAINT UQ_RefTreasuryAccountType_Code UNIQUE (vcCode)
    );
END;
GO
--1.21 types de mouvements de trésorerie
IF OBJECT_ID('dbo.tblRefTreasuryMovementType','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefTreasuryMovementType (
        treasuryMovementTypeId INT IDENTITY(1,1) NOT NULL,
        vcCode                VARCHAR(20) NOT NULL,
        vcTreasuryMovementType                VARCHAR(30) NOT NULL,
        direction           INT NOT NULL,
        
        CONSTRAINT PK_RefTreasuryMovementType PRIMARY KEY  (TreasuryMovementTypeId),
        CONSTRAINT UQ_RefTreasuryMovementType_Code UNIQUE (vcCode),
        CONSTRAINT CK_RefTreasuryMovementType_Direction CHECK (direction IN (-1, 1))
    );
END;
GO

/*==============================================================================
  2. SOCLE : UTILISATEURS, ENTREPRISES, BOUTIQUES
==============================================================================*/
-- 2.1 table user
IF OBJECT_ID('dbo.tblUser','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblUser (
        userId              INT IDENTITY(1,1) NOT NULL,
        vcLastName            VARCHAR(50) NOT NULL,
        vcFirstName           VARCHAR(50) NOT NULL,
        genderId            INT NULL,
        vcEmail               VARCHAR(100) NULL,
        vcPhoneNumber         VARCHAR(20) NULL,
        vcPasswordHash        VARCHAR(255) NOT NULL,
        vcAddress             VARCHAR(150) NULL,
        vcPhotoUrl            VARCHAR(255) NULL,
        dtLastLoginAt         DATETIME NOT NULL DEFAULT GETDATE(),
        btIsActive       BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_tblUser PRIMARY KEY  (userId),
        CONSTRAINT FK_tblUser_Gender FOREIGN KEY (genderId) REFERENCES dbo.tblRefGender(genderId),

         -- Un utilisateur doit avoir soit un email soit un téléphone

        CONSTRAINT CK_tblUser_LoginIdentifier CHECK (vcEmail IS NOT NULL OR vcPhoneNumber IS NOT NULL)
    );
END;
GO

CREATE UNIQUE INDEX UX_tblUser_Email
ON dbo.tblUser(vcEmail)
WHERE vcEmail IS NOT NULL;
GO

CREATE UNIQUE INDEX UX_tblUser_PhoneNumber
ON dbo.tblUser(vcPhoneNumber)
WHERE vcPhoneNumber IS NOT NULL;
GO

--2.2 table principale qui sert à stocker les informations de base sur les entreprises dans le système
IF OBJECT_ID('dbo.tblCompany','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblCompany (
        companyId           INT IDENTITY(1,1) NOT NULL,
        vcCompanyCode         VARCHAR(20) NOT NULL,
        vcCompanyName         VARCHAR(50) NOT NULL,
        vcRccm                VARCHAR(50) NULL,
        vcPhoneNumber         VARCHAR(20) NULL,
        vcEmail               NVARCHAR(100) NULL,
        vcAddress             VARCHAR(150) NULL,
        vcCity                VARCHAR(50) NULL,
        vcLogoUrl             VARCHAR(255) NULL,
        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_Company PRIMARY KEY  (companyId),
        CONSTRAINT UQ_Company_CompanyCode UNIQUE (vcCompanyCode)
        
    );
END;
GO

-- 2.3 table de liaison  qui sert à gérer la relation entre les utilisateurs et les entreprises dans le système

IF OBJECT_ID('dbo.tblUserCompany','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblUserCompany (
        userCompanyId       BIGINT IDENTITY(1,1) NOT NULL,
        userId              INT NOT NULL,
        companyId           INT NOT NULL,
        roleId              INT NOT NULL,
        createdByUserId     INT NULL,
        dtAssignedAt          DATETIME NOT NULL DEFAULT GETDATE(),
        dtEndedAt             DATETIME  NULL DEFAULT GETDATE(),
        btEnabled BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_tblUserCompany PRIMARY KEY  (userCompanyId),
        CONSTRAINT FK_tblUserCompany_User FOREIGN KEY (userId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_tblUserCompany_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_tblUserCompany_Role FOREIGN KEY (roleId) REFERENCES dbo.tblRefRole(roleId),
        CONSTRAINT FK_tblUserCompany_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(UserId),
        CONSTRAINT CK_tblUserCompany_Dates CHECK (dtEndedAt IS NULL OR dtEndedAt >= dtAssignedAt)
    );
END;
GO

CREATE UNIQUE INDEX UX_tblUserCompany_ActiveAssignment
ON dbo.tblUserCompany(userId, companyId, roleId)
WHERE btEnabled = 1;
GO

--2.4 table transactionnelle qui sert à gérer les demandes d’enregistrement administrateur dans ton système
IF OBJECT_ID('dbo.tblAdminRegistrationRequest','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblAdminRegistrationRequest (
        registrationRequestId INT IDENTITY(1,1) NOT NULL,
        userId              INT NOT NULL,
        companyId           INT NOT NULL,
        registrationRequestStatusId INT NOT NULL,
        dtRequestedAt         DATETIME NOT NULL DEFAULT GETDATE(),
        dtProcessedAt         DATETIME  NULL DEFAULT GETDATE(),
        processedByUserId   INT NULL,
        vcRejectionReason     VARCHAR(200) NULL,
        vcComment             NVARCHAR(200) NULL,
        btEnabled BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_tblAdminRegistrationRequest PRIMARY KEY (registrationRequestId),
        CONSTRAINT FK_tblAdminRegistrationRequest_User FOREIGN KEY (userId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_tblAdminRegistrationRequest_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_tblAdminRegistrationRequest_Status FOREIGN KEY (registrationRequestStatusId) REFERENCES dbo.tblRefRegistrationRequestStatus(registrationRequestStatusId),
        CONSTRAINT FK_tblAdminRegistrationRequest_ProcessedBy FOREIGN KEY (processedByUserId) REFERENCES dbo.tblUser(userId)
    );
END;
GO
-- 2.5 table la boutique
CREATE TABLE dbo.tblStore (
    storeId             INT IDENTITY(1,1) NOT NULL,
    companyId           INT NOT NULL,
    storeTypeId         INT NOT NULL,
    vcStoreCode           VARCHAR(20) NOT NULL,
    vcStoreName           VARCHAR(50) NOT NULL,
    vcAddress             VARCHAR(150) NULL,
    vcCity                VARCHAR(50) NULL,
    vcPhoneNumber         VARCHAR(20) NULL,
    dcLatitude            DECIMAL(9,6) NULL,
    dcLongitude           DECIMAL(9,6) NULL,
    createdByUserId     INT NOT NULL,
    btEnabled BIT NOT NULL DEFAULT 1,
    dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_Store PRIMARY KEY CLUSTERED (StoreId),
    CONSTRAINT FK_Store_Company FOREIGN KEY (CompanyId) REFERENCES dbo.tblCompany(companyId),
    CONSTRAINT FK_Store_StoreType FOREIGN KEY (StoreTypeId) REFERENCES dbo.tblRefStoreType(storeTypeId),
    CONSTRAINT FK_Store_CreatedBy FOREIGN KEY (CreatedByUserId) REFERENCES dbo.tblUser(UserId),
    CONSTRAINT UQ_Store_Company_StoreCode UNIQUE (companyId, vcStoreCode),
    CONSTRAINT CK_Store_Latitude CHECK (dcLatitude IS NULL OR dcLatitude BETWEEN -90 AND 90),
    CONSTRAINT CK_Store_Longitude CHECK (dcLongitude IS NULL OR dcLongitude BETWEEN -180 AND 180)
);
GO

CREATE INDEX IX_Store_CompanyId ON dbo.tblStore(companyId);
GO
--2.6  table de liaison qui sert à gérer la relation entre les utilisateurs et les magasins (Store) dans le système
IF OBJECT_ID('dbo.tblUserStore','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblUserStore (
        userStoreId         INT IDENTITY(1,1) NOT NULL,
        userId              INT NOT NULL,
        storeId             INT NOT NULL,
        roleId              INT NOT NULL,
        assignedByUserId    INT NOT NULL,
        dtStartDate           DATETIME NOT NULL DEFAULT GETDATE(),
        dtEndDate             DATETIME  NULL DEFAULT GETDATE(),
        btEnabled BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_tblUserStore PRIMARY KEY  (userStoreId),
        CONSTRAINT FK_tblUserStore_User FOREIGN KEY (userId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_tblUserStore_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_tblUserStore_Role FOREIGN KEY (roleId) REFERENCES dbo.tblRefRole(roleId),
        CONSTRAINT FK_tblUserStore_AssignedBy FOREIGN KEY (assignedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT CK_tblUserStore_Dates CHECK (dtEndDate IS NULL OR dtEndDate >= dtStartDate)
    );
END;
GO

CREATE UNIQUE INDEX UX_UserStore_ActiveAssignment
ON dbo.tblUserStore(userId, storeId, roleId)
WHERE btEnabled = 1;
GO

/*==============================================================================
  3. CLIENTS ET FOURNISSEURS
==============================================================================*/

--3.1 Table Clients
IF OBJECT_ID('dbo.tblCustomer','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblCustomer (
        customerId          INT IDENTITY(1,1) NOT NULL,
        companyId           INT NOT NULL,
        customerTypeId      INT NOT NULL,
        genderId            INT NULL,
        vcCustomerCode      VARCHAR(20) NOT NULL,
        vcLastName            VARCHAR(50)  NULL,
        vcFirstName           VARCHAR(50) NULL,
        vcEmail               VARCHAR(100) NULL,
        vcPhoneNumber         VARCHAR(20) NULL,
        
        vcQuartier            VARCHAR(50) NULL,
        vcCity                VARCHAR(50) NULL,
        createdByUserId     INT NOT NULL,
        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_tblCustomer PRIMARY KEY  (customerId),
        CONSTRAINT FK_tblCustomer_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_tblCustomer_Type FOREIGN KEY (customerTypeId) REFERENCES dbo.tblRefCustomerType(customerTypeId),
        CONSTRAINT FK_tblCustomer_Gender FOREIGN KEY (genderId) REFERENCES dbo.tblRefGender(genderId),
        CONSTRAINT FK_tblCustomer_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_tblCustomer_Company_Code UNIQUE (companyId, vcCustomerCode)
    );
END;
GO

CREATE INDEX IX_Customer_Company_Phone ON dbo.tblCustomer(companyId, vcPhoneNumber);
GO

-- 3.2 table principale qui sert à gérer les informations sur les fournisseurs d’une entreprise dans le système. 
IF OBJECT_ID('dbo.tblSupplier','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblSupplier (
        supplierId          INT IDENTITY(1,1) NOT NULL,
        companyId           INT NOT NULL,
        vcSupplierCode        VARCHAR(20) NOT NULL,
        vcLastName            VARCHAR(50) NULL,
        vcFirstName           VARCHAR(50) NULL,
        vcBusinessName        VARCHAR(50) NULL,
        vcPhoneNumber         VARCHAR(20) NULL,
        vcEmail               VARCHAR(100) NULL,
        vcAddress             VARCHAR(150) NULL,
        vcCity                VARCHAR(50) NULL,
        createdByUserId     INT NOT NULL,
        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_tblSupplier PRIMARY KEY  (supplierId),
        CONSTRAINT FK_tblSupplier_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_tblSupplier_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_tblSupplier_Company_Code UNIQUE (companyId, vcSupplierCode),
        CONSTRAINT CK_tblSupplier_Name CHECK (
            vcBusinessName IS NOT NULL OR vcLastName IS NOT NULL OR vcFirstName IS NOT NULL
        )
    );
END;
GO

/*==============================================================================
  4. CATALOGUE PRODUITS
==============================================================================*/
--4.1 table de référence hiérarchique qui sert à organiser les catégories de produits d’une entreprise
IF OBJECT_ID('dbo.tblProductCategory','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblProductCategory (
        productCategoryId   INT IDENTITY(1,1) NOT NULL,
        companyId           INT NOT NULL,
        vcCategoryCode        VARCHAR(20) NOT NULL,
        vcCategoryName        VARCHAR(50) NOT NULL,
        vcDescription         NVARCHAR(150) NULL,
        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_tblProductCategory PRIMARY KEY (productCategoryId),
        CONSTRAINT FK_ProductCategory_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT UQ_ProductCategory_Company_Code UNIQUE (companyId, vcCategoryCode)
    );
END;
GO

--4.2 la table Produit
IF OBJECT_ID('dbo.tblProduct','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblProduct (
        productId           BIGINT IDENTITY(1,1) NOT NULL,
        companyId           INT NOT NULL,
        productCategoryId   INT NOT NULL,
        unitOfMeasureId     INT  NULL,
        vcProductCode         VARCHAR(20) NOT NULL,
        vcProductName         VARCHAR(50) NOT NULL,
        vcDescription         VARCHAR(150) NULL,
        vcBarcode             VARCHAR(100) NULL,
        vcImageUrl            VARCHAR(255) NULL,
        dcDefaultAlertThreshold DECIMAL(18,3) NOT NULL CONSTRAINT DF_Product_DefaultAlertThreshold DEFAULT (0),
        createdByUserId     INT NOT NULL,

        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_tblProduct PRIMARY KEY (productId),
        CONSTRAINT FK_tblProduct_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_tblProduct_Category FOREIGN KEY (productCategoryId) REFERENCES dbo.tblProductCategory(productCategoryId),
        CONSTRAINT FK_tblProduct_UOM FOREIGN KEY (unitOfMeasureId) REFERENCES dbo.tblRefUnitOfMeasure(unitOfMeasureId),
        CONSTRAINT FK_tblProduct_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_tblProduct_Company_Code UNIQUE (companyId, vcProductCode),
        CONSTRAINT CK_tblProduct_DefaultAlertThreshold CHECK (dcDefaultAlertThreshold >= 0)
    );
END;
GO

CREATE UNIQUE INDEX UX_Product_Company_Barcode
ON dbo.tblProduct(companyId, vcBarcode)
WHERE vcBarcode IS NOT NULL;
GO

--4.3  table de liaison qui sert à gérer la relation entre les fournisseurs et les produits dans le système.
IF OBJECT_ID('dbo.tblSupplierProduct','U') IS NULL
BEGIN 
    CREATE TABLE dbo.tblSupplierProduct (
        supplierProductId   INT IDENTITY(1,1) NOT NULL,
        supplierId          INT NOT NULL,
        productId           BIGINT NOT NULL,
        vcSupplierReference   VARCHAR(50) NULL,
        mReferencePurchasePrice MONEY NULL,
        deliveryLeadTimeDays INT NULL,
        IsPreferred         BIT NOT NULL DEFAULT 0,
        btEnabled BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_tblSupplierProduct PRIMARY KEY  (supplierProductId),
        CONSTRAINT FK_tblSupplierProduct_Supplier FOREIGN KEY (supplierId) REFERENCES dbo.tblSupplier(supplierId),
        CONSTRAINT FK_tblSupplierProduct_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT UQ_tblSupplierProduct UNIQUE (supplierId, productId),
        CONSTRAINT CK_tblSupplierProduct_Price CHECK (mReferencePurchasePrice IS NULL OR mReferencePurchasePrice >= 0),
        CONSTRAINT CK_tblSupplierProduct_LeadTime CHECK (deliveryLeadTimeDays IS NULL OR deliveryLeadTimeDays >= 0)
    );
END;
GO

-- 4.4 table de liaison qui sert à gérer la relation entre les produits et les magasins (Store) dans le système.
IF OBJECT_ID('dbo.tblStoreProduct','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblStoreProduct (
        storeProductId      INT IDENTITY(1,1) NOT NULL,
        storeId             INT NOT NULL,
        productId           BIGINT NOT NULL,
        mCurrentSalePrice   MONEY NOT NULL,
        alertThreshold      INT NULL,
        btEnabled         BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_StoreProduct PRIMARY KEY  (storeProductId),
        CONSTRAINT FK_StoreProduct_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_StoreProduct_Product FOREIGN KEY (ProductId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT UQ_StoreProduct UNIQUE (storeId, productId),
        CONSTRAINT CK_StoreProduct_Price CHECK (mCurrentSalePrice >= 0),
        CONSTRAINT CK_StoreProduct_AlertThreshold CHECK (alertThreshold IS NULL OR alertThreshold >= 0)
    );
END;
GO
--4.5 table d’historisation qui sert à conserver la trace des évolutions de prix des produits dans chaque magasin
IF OBJECT_ID('dbo.tblProductPriceHistory','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblProductPriceHistory (
        productPriceHistoryId INT IDENTITY(1,1) NOT NULL,
        storeId             INT NOT NULL,
        productId           BIGINT NOT NULL,
        mPurchasePrice       MONEY NULL,
        mSalePrice           MONEY NOT NULL,
        dtEffectiveFrom       DATETIME NOT NULL,
        dtEffectiveTo         DATETIME  NULL ,
        createdByUserId     INT NOT NULL,
        CONSTRAINT PK_ProductPriceHistory PRIMARY KEY (productPriceHistoryId),
        CONSTRAINT FK_ProductPriceHistory_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_ProductPriceHistory_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT FK_ProductPriceHistory_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT CK_ProductPriceHistory_Prices CHECK (
            mSalePrice >= 0 AND (mPurchasePrice IS NULL OR mPurchasePrice >= 0)
        ),
        CONSTRAINT CK_ProductPriceHistory_Dates CHECK (dtEffectiveTo IS NULL OR dtEffectiveTo >= dtEffectiveFrom)
    );
END;
GO

CREATE INDEX IX_ProductPriceHistory_ProductStoreDate
ON dbo.tblProductPriceHistory(productId, storeId, dtEffectiveFrom DESC);
GO
--4.6 table transactionnelle qui sert à gérer les promotions commerciales mises en place par une entreprise. 

IF OBJECT_ID('dbo.tblPromotion','U')IS NULL
BEGIN
    CREATE TABLE dbo.tblPromotion (
        promotionId         INT IDENTITY(1,1) NOT NULL,
        companyId           INT NOT NULL,
        vcPromotionName     VARCHAR(50) NOT NULL,
        discountTypeId      INT NOT NULL,
        dcDiscountValue       DECIMAL(18,2) NOT NULL,
        dtStartDate           DATETIME NOT NULL,
        dtEndDate             DATETIME NOT NULL,
        createdByUserId     INT NOT NULL,

        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_tblPromotion PRIMARY KEY (promotionId),
        CONSTRAINT FK_tblPromotion_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_tblPromotion_DiscountType FOREIGN KEY (discountTypeId) REFERENCES dbo.tblRefDiscountType(discountTypeId),
        CONSTRAINT FK_tblPromotion_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT CK_tblPromotion_Value CHECK (dcDiscountValue >= 0),
        CONSTRAINT CK_tblPromotion_Dates CHECK (dtEndDate >= dtStartDate)
    );
END;
GO

--4.7  table de liaison qui sert à associer les promotions aux produits concernés.
IF OBJECT_ID('dbo.tblPromotionProduct','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblPromotionProduct (
        promotionProductId  INT IDENTITY(1,1) NOT NULL,
        promotionId         INT NOT NULL,
        productId           BIGINT NOT NULL,
        CONSTRAINT PK_PromotionProduct PRIMARY KEY (promotionProductId),
        CONSTRAINT FK_PromotionProduct_Promotion FOREIGN KEY (promotionId) REFERENCES dbo.tblPromotion(promotionId),
        CONSTRAINT FK_PromotionProduct_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT UQ_PromotionProduct UNIQUE (promotionId, productId)
    );
END;
GO

-- 4.8 table de liaison qui sert à associer les promotions aux magasins (Store) concernés
IF OBJECT_ID('dbo.tblPromotionStore','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblPromotionStore (
        promotionStoreId    INT IDENTITY(1,1) NOT NULL,
        promotionId         INT NOT NULL,
        storeId             INT NOT NULL,
        CONSTRAINT PK_PromotionStore PRIMARY KEY  (promotionStoreId),
        CONSTRAINT FK_PromotionStore_Promotion FOREIGN KEY (promotionId) REFERENCES dbo.tblPromotion(promotionId),
        CONSTRAINT FK_PromotionStore_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT UQ_PromotionStore UNIQUE (promotionId, storeId)
    );
END;

GO

/*==============================================================================
  5. STOCK, LOTS, APPROVISIONNEMENTS, TRANSFERTS, INVENTAIRES
==============================================================================*/
--5.1 table transactionnelle qui sert à gérer le stock des produits par magasin.

IF OBJECT_ID('dbo.tblStoreStock','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblStoreStock (
        storeStockId        INT IDENTITY(1,1) NOT NULL,
        storeId             INT NOT NULL,
        productId           BIGINT NOT NULL,
        dcAvailableQuantity   DECIMAL(18,3) NOT NULL CONSTRAINT DF_StoreStock_AvailableQuantity DEFAULT (0),
        dcReservedQuantity    DECIMAL(18,3) NOT NULL CONSTRAINT DF_StoreStock_ReservedQuantity DEFAULT (0),
        dtUpdatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
        RowVersion          ROWVERSION NOT NULL,

        CONSTRAINT PK_StoreStock PRIMARY KEY (storeStockId),
        CONSTRAINT FK_StoreStock_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_StoreStock_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT UQ_StoreStock UNIQUE (storeId, productId),
        CONSTRAINT CK_StoreStock_AvailableQuantity CHECK (dcAvailableQuantity >= 0),
        CONSTRAINT CK_StoreStock_ReservedQuantity CHECK (dcReservedQuantity >= 0),
        CONSTRAINT CK_StoreStock_Reservation CHECK (dcReservedQuantity <= dcAvailableQuantity)
    );
END;
GO

CREATE INDEX IX_StoreStock_ProductId ON dbo.tblStoreStock(productId);
GO

--5.2 table transactionnelle de gestion des lots de stock.

IF OBJECT_ID('dbo.tblStockLot','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblStockLot (
        stockLotId          INT IDENTITY(1,1) NOT NULL,
        storeId             INT NOT NULL,
        productId           BIGINT NOT NULL,
        vcLotNumber           VARCHAR(30) NOT NULL,
        dtManufacturingAt   DATE NULL,
        dtExpirationAt      DATE NULL,
        dcInitialQuantity     DECIMAL(18,3) NOT NULL,
        dcRemainingQuantity   DECIMAL(18,3) NOT NULL,
        mUnitPurchasePrice   MONEY NOT NULL,
        dtReceivedAt          DATETIME NOT NULL,
        btEnabled BIT NOT NULL DEFAULT 1,

        CONSTRAINT PK_tblStockLot PRIMARY KEY (stockLotId),
        CONSTRAINT FK_tblStockLot_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_tblStockLot_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT UQ_StockLot_Store_Product_Lot UNIQUE (storeId, productId, vcLotNumber),
        CONSTRAINT CK_StockLot_Quantities CHECK (
            dcInitialQuantity >= 0 AND dcRemainingQuantity >= 0 AND dcRemainingQuantity <= dcInitialQuantity
        ),
        CONSTRAINT CK_StockLot_Price CHECK (mUnitPurchasePrice >= 0),
        CONSTRAINT CK_StockLot_Dates CHECK (
            dtExpirationAt IS NULL OR dtManufacturingAt IS NULL OR dtExpirationAt >= dtManufacturingAt
        )
    );
END;
GO

CREATE INDEX IX_StockLot_ExpirationDate ON dbo.tblStockLot(dtExpirationAt) WHERE dtExpirationAt IS NOT NULL;
GO
--5.3 table transactionnelle qui sert à gérer les achats effectués auprès des fournisseurs pour un magasin donné.
IF OBJECT_ID('dbo.tblPurchase','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblPurchase (
        purchaseId          INT IDENTITY(1,1) NOT NULL,
        vcPurchaseNumber      VARCHAR(30) NOT NULL,
        supplierId          INT NOT NULL,
        storeId             INT NOT NULL,
        purchaseStatusId    INT NOT NULL,
        dtOrderAt          DATETIME NOT NULL,
        dtReceivedAt        DATETIME NULL,
        mTotalAmount         MONEY NOT NULL CONSTRAINT DF_Purchase_TotalAmount DEFAULT (0),
        createdByUserId     INT NOT NULL,
        receivedByUserId    INT NULL,

        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_Purchase PRIMARY KEY (purchaseId),
        CONSTRAINT FK_Purchase_Supplier FOREIGN KEY (supplierId) REFERENCES dbo.tblSupplier(supplierId),
        CONSTRAINT FK_Purchase_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_Purchase_Status FOREIGN KEY (purchaseStatusId) REFERENCES dbo.tblRefPurchaseStatus(purchaseStatusId),
        CONSTRAINT FK_Purchase_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_Purchase_ReceivedBy FOREIGN KEY (receivedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_Purchase_Number UNIQUE (vcPurchaseNumber),
        CONSTRAINT CK_Purchase_TotalAmount CHECK (mTotalAmount >= 0),
        CONSTRAINT CK_Purchase_Dates CHECK (dtReceivedAt IS NULL OR dtReceivedAt >= dtOrderAt)
    );
END;
GO
--5.4 table de détail transactionnelle qui sert à enregistrer les lignes d’articles d’une commande fournisseur (liée à la table Purchase).

IF OBJECT_ID('dbo.tblPurchaseDetail','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblPurchaseDetail (
        purchaseDetailId    INT IDENTITY(1,1) NOT NULL,
        purchaseId          INT NOT NULL,
        productId           BIGINT NOT NULL,
        dcOrderedQuantity     DECIMAL(18,3) NOT NULL,
        dcReceivedQuantity    DECIMAL(18,3) NOT NULL CONSTRAINT DF_PurchaseDetail_ReceivedQuantity DEFAULT (0),
        mUnitPurchasePrice   MONEY NOT NULL,
        vcLotNumber           VARCHAR(30) NULL,
        dtExpirationAt     DATE NULL,
        LineAmount          AS (dcReceivedQuantity * mUnitPurchasePrice) PERSISTED,
        CONSTRAINT PK_tblPurchaseDetail PRIMARY KEY  (purchaseDetailId),
        CONSTRAINT FK_tblPurchaseDetail_Purchase FOREIGN KEY (purchaseId) REFERENCES dbo.tblPurchase(purchaseId),
        CONSTRAINT FK_tblPurchaseDetail_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT CK_tblPurchaseDetail_Quantities CHECK (
            dcOrderedQuantity > 0 AND dcReceivedQuantity >= 0
        ),
        CONSTRAINT CK_PurchaseDetail_Price CHECK (mUnitPurchasePrice >= 0)
    );
END;
GO
-- 5.5  table transactionnelle qui sert à gérer les transferts de stock entre magasins. 
IF OBJECT_ID('dbo.tblStockTransfer','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblStockTransfer (
        stockTransferId     INT IDENTITY(1,1) NOT NULL,
        vcTransferNumber      VARCHAR(30) NOT NULL,
        sourceStoreId       INT NOT NULL,
        destinationStoreId  INT NOT NULL,
        transferStatusId    INT NOT NULL,
        createdByUserId     INT NOT NULL,
        approvedByUserId    INT NULL,
        vcCarrierName         VARCHAR(50) NULL,
        dtCreatedAt           DATETIME NOT NULL,
        dtShippedAt           DATETIME NULL,
        dtReceivedAt          DATETIME NULL,
        IsCancelled          BIT NOT NULL DEFAULT 0,
        vcCancellationReason  VARCHAR(150) NULL,
        CONSTRAINT PK_StockTransfer PRIMARY KEY (stockTransferId),
        CONSTRAINT FK_StockTransfer_SourceStore FOREIGN KEY (sourceStoreId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_StockTransfer_DestinationStore FOREIGN KEY (destinationStoreId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_StockTransfer_Status FOREIGN KEY (transferStatusId) REFERENCES dbo.tblRefTransferStatus(transferStatusId),
        CONSTRAINT FK_StockTransfer_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_StockTransfer_ApprovedBy FOREIGN KEY (approvedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_StockTransfer_Number UNIQUE (vcTransferNumber),
        CONSTRAINT CK_StockTransfer_DifferentStores CHECK (sourceStoreId <> destinationStoreId),
        CONSTRAINT CK_StockTransfer_Dates CHECK (
            (dtShippedAt IS NULL OR dtShippedAt >= dtCreatedAt)
            AND (dtReceivedAt IS NULL OR dtShippedAt IS NULL OR dtReceivedAt >= dtShippedAt)
        )
    );
END;
GO
--5.6 table de détail transactionnelle qui sert à enregistrer les lignes de produits incluses dans un transfert de stock (liée à la table StockTransfer). 
IF OBJECT_ID('dbo.tblStockTransferDetail','U') IS NULL

BEGIN

    CREATE TABLE dbo.tblStockTransferDetail (
        stockTransferDetailId INT IDENTITY(1,1) NOT NULL,
        stockTransferId     INT NOT NULL,
        productId           BIGINT NOT NULL,
        stockLotId          INT NULL,
        dcRequestedQuantity   DECIMAL(18,3) NOT NULL,
        dcShippedQuantity     DECIMAL(18,3) NOT NULL CONSTRAINT DF_StockTransferDetail_Shipped DEFAULT (0),
        dcReceivedQuantity    DECIMAL(18,3) NOT NULL CONSTRAINT DF_StockTransferDetail_Received DEFAULT (0),
        CONSTRAINT PK_StockTransferDetail PRIMARY KEY (stockTransferDetailId),
        CONSTRAINT FK_StockTransferDetail_Transfer FOREIGN KEY (stockTransferId) REFERENCES dbo.tblStockTransfer(stockTransferId),
        CONSTRAINT FK_StockTransferDetail_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT FK_StockTransferDetail_Lot FOREIGN KEY (stockLotId) REFERENCES dbo.tblStockLot(stockLotId),
        CONSTRAINT CK_StockTransferDetail_Quantities CHECK (
            dcRequestedQuantity > 0 AND dcShippedQuantity >= 0 AND dcReceivedQuantity >= 0
        )
    );
END;
GO
--5.7 table transactionnelle qui sert à gérer les ajustements de stock dans un magasin.
IF OBJECT_ID('dbo.tblStockAdjustment','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblStockAdjustment (
        stockAdjustmentId   INT IDENTITY(1,1) NOT NULL,
        storeId             INT NOT NULL,
        adjustmentReasonId  INT NOT NULL,
        adjustmentStatusId  INT NOT NULL,
        vcJustification       VARCHAR(150) NOT NULL,
        vcProofImageUrl       VARCHAR(255) NULL,
        createdByUserId     INT NOT NULL,
        approvedByUserId    INT NULL,
        dtcreatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
        dtApprovedAt          DATETIME NULL,
        vcApprovalComment     VARCHAR(150) NULL,
        CONSTRAINT PK_StockAdjustment PRIMARY KEY  (stockAdjustmentId),
        CONSTRAINT FK_StockAdjustment_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_StockAdjustment_Reason FOREIGN KEY (adjustmentReasonId) REFERENCES dbo.tblRefAdjustmentReason(adjustmentReasonId),
        CONSTRAINT FK_StockAdjustment_Status FOREIGN KEY (adjustmentStatusId) REFERENCES dbo.tblRefAdjustmentStatus(adjustmentStatusId),
        CONSTRAINT FK_StockAdjustment_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_StockAdjustment_ApprovedBy FOREIGN KEY (approvedByUserId) REFERENCES dbo.tblUser(userId)
    );
END;
GO
--5.8 table de détail transactionnelle qui sert à enregistrer les lignes de produits concernées par un ajustement de stock (liée à la table StockAdjustment).

IF OBJECT_ID('dbo.tblStockAdjustmentDetail','U') IS NULL
BEGIN

    CREATE TABLE dbo.tblStockAdjustmentDetail (
        stockAdjustmentDetailId INT IDENTITY(1,1) NOT NULL,
        stockAdjustmentId   INT NOT NULL,
        productId           BIGINT NOT NULL,
        stockLotId          INT NULL,
        dcQuantityBefore      DECIMAL(18,3) NOT NULL,
        dcAdjustmentQuantity  DECIMAL(18,3) NOT NULL,
        dcQuantityAfter       DECIMAL(18,3) NOT NULL,
        CONSTRAINT PK_StockAdjustmentDetail PRIMARY KEY  (stockAdjustmentDetailId),
        CONSTRAINT FK_StockAdjustmentDetail_Adjustment FOREIGN KEY (stockAdjustmentId) REFERENCES dbo.tblStockAdjustment(stockAdjustmentId),
        CONSTRAINT FK_StockAdjustmentDetail_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT FK_StockAdjustmentDetail_Lot FOREIGN KEY (stockLotId) REFERENCES dbo.tblStockLot(stockLotId),
        CONSTRAINT CK_StockAdjustmentDetail_Quantities CHECK (
            dcQuantityBefore >= 0 AND dcQuantityAfter >= 0
            AND dcQuantityAfter = dcQuantityBefore + dcAdjustmentQuantity
        )
    );
END;
GO

--5.9 table transactionnelle qui sert à gérer les opérations d’inventaire dans un magasin. 
IF OBJECT_ID('dbo.tblInventory','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblInventory (
        inventoryId         INT IDENTITY(1,1) NOT NULL,
        vcInventoryNumber     VARCHAR(30) NOT NULL,
        storeId             INT NOT NULL,
        InventoryStatusId   INT NOT NULL,
        dtStartedAt           DATETIME NOT NULL,
        dtEndedAt             DATETIME NULL,
        createdByUserId     INT NOT NULL,
        approvedByUserId    INT NULL,
        CONSTRAINT PK_Inventory PRIMARY KEY  (inventoryId),
        CONSTRAINT FK_Inventory_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_Inventory_Status FOREIGN KEY (inventoryStatusId) REFERENCES dbo.tblRefInventoryStatus(inventoryStatusId),
        CONSTRAINT FK_Inventory_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_Inventory_ApprovedBy FOREIGN KEY (approvedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_Inventory_Number UNIQUE (vcInventoryNumber),
        CONSTRAINT CK_Inventory_Dates CHECK (dtEndedAt IS NULL OR dtEndedAt >= dtStartedAt)
    );
END;
GO

--5.10 table de détail transactionnelle qui sert à enregistrer les lignes de produits contrôlés lors d’un inventaire (liée à la table Inventory). 

IF OBJECT_ID('dbo.tblInventoryDetail','U') IS NULL

BEGIN

    CREATE TABLE dbo.tblInventoryDetail (
        inventoryDetailId   INT IDENTITY(1,1) NOT NULL,
        inventoryId         INT NOT NULL,
        productId           BIGINT NOT NULL,
        dcTheoreticalQuantity DECIMAL(18,3) NOT NULL,
        dcPhysicalQuantity    DECIMAL(18,3) NOT NULL,
        DifferenceQuantity  AS (dcPhysicalQuantity - dcTheoreticalQuantity) PERSISTED,
        vcComment             NVARCHAR(150) NULL,
        CONSTRAINT PK_InventoryDetai PRIMARY KEY (inventoryDetailId),
        CONSTRAINT FK_InventoryDetail_Inventory FOREIGN KEY (inventoryId) REFERENCES dbo.tblInventory(inventoryId),
        CONSTRAINT FK_InventoryDetail_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT UQ_InventoryDetail UNIQUE (inventoryId, productId),
        CONSTRAINT CK_InventoryDetail_Quantities CHECK (
            dcTheoreticalQuantity >= 0 AND dcPhysicalQuantity >= 0
        )
    );
END;
GO

-- 5.11 table transactionnelle centrale qui sert à enregistrer tous les mouvements de stock dans un magasin, quel qu’en soit le type (entrée, sortie, ajustement, transfert, etc.).  
IF OBJECT_ID('dbo.tblStockMovement','U') IS NULL
BEGIN

    CREATE TABLE dbo.tblStockMovement (
        stockMovementId    INT IDENTITY(1,1) NOT NULL,
        storeId             INT NOT NULL,
        productId           BIGINT NOT NULL,
        stockLotId          INT NULL,
        stockMovementTypeId INT NOT NULL,
        dcQuantity            DECIMAL(18,3) NOT NULL,
        dcStockBefore         DECIMAL(18,3) NOT NULL,
        dcStockAfter          DECIMAL(18,3) NOT NULL,
        vcReferenceType       VARCHAR(30) NULL,
        referenceId         INT NULL,
        operatedByUserId    INT NOT NULL,
        dtMovementAt          DATETIME NOT NULL DEFAULT GETDATE(),
        vcComment             VARCHAR(150) NULL,
        CONSTRAINT PK_StockMovement PRIMARY KEY  (stockMovementId),
        CONSTRAINT FK_StockMovement_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_StockMovement_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT FK_StockMovement_Lot FOREIGN KEY (stockLotId) REFERENCES dbo.tblStockLot(stockLotId),
        CONSTRAINT FK_StockMovement_Type FOREIGN KEY (stockMovementTypeId) REFERENCES dbo.tblRefStockMovementType(stockMovementTypeId),
        CONSTRAINT FK_StockMovement_OperatedBy FOREIGN KEY (operatedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT CK_StockMovement_Quantity CHECK (dcQuantity <> 0),
        CONSTRAINT CK_StockMovement_Stocks CHECK (dcStockBefore >= 0 AND dcStockAfter >= 0)
    );
END;
GO

CREATE INDEX IX_StockMovement_Store_Product_Date
ON dbo.tblStockMovement(storeId, productId, dtMovementAt DESC);
GO

CREATE INDEX IX_StockMovement_Reference
ON dbo.tblStockMovement(vcReferenceType, referenceId);
GO

/*==============================================================================
  6. CAISSES, SESSIONS ET DEPENSES
==============================================================================*/
-- 6.1 table de référence opérationnelle qui sert à gérer les caisses enregistreuses d’un magasin
IF OBJECT_ID('dbo.tblCashRegister','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblCashRegister (
        cashRegisterId      INT IDENTITY(1,1) NOT NULL,
        storeId             INT NOT NULL,
        vcRegisterCode        VARCHAR(20) NOT NULL,
        vcRegisterName        VARCHAR(50) NOT NULL,
        btEnabled BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_CashRegister PRIMARY KEY (cashRegisterId),
        CONSTRAINT FK_CashRegister_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT UQ_CashRegister_Store_Code UNIQUE (storeId, vcRegisterCode)
    );
END;
GO

--6.2 table transactionnelle qui sert à gérer les sessions de caisse ouvertes par les utilisateurs sur une caisse enregistreuse donnée. 
IF OBJECT_ID('dbo.tblCashSession','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblCashSession (
        cashSessionId       INT IDENTITY(1,1) NOT NULL,
        cashRegisterId      INT NOT NULL,
        userId              INT NOT NULL,
        cashSessionStatusId INT NOT NULL,
        mOpeningCaisse        MONEY NOT NULL,
        dtOpenedAt            DATETIME NOT NULL DEFAULT GETDATE(),
        dtClosedAt            DATETIME NULL,
        mDeclaredClosingAmount MONEY NULL,
        IsReportGenerated   BIT NOT NULL DEFAULT 0,

        CONSTRAINT PK_CashSession PRIMARY KEY  (cashSessionId),
        CONSTRAINT FK_CashSession_Register FOREIGN KEY (cashRegisterId) REFERENCES dbo.tblCashRegister(cashRegisterId),
        CONSTRAINT FK_CashSession_User FOREIGN KEY (userId) REFERENCES dbo.tblUser(UserId),
        CONSTRAINT FK_CashSession_Status FOREIGN KEY (cashSessionStatusId) REFERENCES dbo.tblRefCashSessionStatus(cashSessionStatusId),
        CONSTRAINT CK_CashSession_Amounts CHECK (
            mOpeningCaisse >= 0 AND (mDeclaredClosingAmount IS NULL OR mDeclaredClosingAmount >= 0)
        ),
        CONSTRAINT CK_CashSession_Dates CHECK (dtClosedAt IS NULL OR dtClosedAt >= dtOpenedAt)
    );
END;
GO

CREATE INDEX IX_CashSession_Register_OpenedAt
ON dbo.tblCashSession(cashRegisterId, dtOpenedAt DESC);
GO

-- 6.3 table de référence hiérarchique qui sert à définir et organiser les catégories de dépenses d’une entreprise.
IF OBJECT_ID('dbo.tblExpenseCategory','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblExpenseCategory (
        expenseCategoryId   INT IDENTITY(1,1) NOT NULL,
        companyId           INT NOT NULL,
        vcExpenseCategoryCode        VARCHAR(20) NOT NULL,
        vcExpenseCategory        VARCHAR(30) NOT NULL,
        btEnabled BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_ExpenseCategory PRIMARY KEY  (expenseCategoryId),
        CONSTRAINT FK_ExpenseCategory_Company FOREIGN KEY (CompanyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT UQ_ExpenseCategory_Company_Code UNIQUE (companyId, vcExpenseCategoryCode)
    );
END;
GO

-- 6.4 table transactionnelle qui sert à enregistrer les dépenses effectuées dans un magasin.
IF OBJECT_ID('dbo.tblExpense','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblExpense (
        expenseId           INT IDENTITY(1,1) NOT NULL,
        cashSessionId       INT NULL,
        storeId             INT NOT NULL,
        expenseCategoryId   INT NOT NULL,
        mAmount              MONEY NOT NULL,
        vcReason              VARCHAR(150) NOT NULL,
        vcProofUrl            VARCHAR(255) NULL,
        vcStatusCode          VARCHAR(20) NOT NULL,
        createdByUserId     INT NOT NULL,
        approvedByUserId    INT NULL,
        dtApprovedAt          DATETIME NULL,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_Expense PRIMARY KEY (expenseId),
        CONSTRAINT FK_Expense_CashSession FOREIGN KEY (cashSessionId) REFERENCES dbo.tblCashSession(cashSessionId),
        CONSTRAINT FK_Expense_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_Expense_Category FOREIGN KEY (expenseCategoryId) REFERENCES dbo.tblExpenseCategory(expenseCategoryId),
        CONSTRAINT FK_Expense_CreatedBy FOREIGN KEY (createdByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_Expense_ApprovedBy FOREIGN KEY (approvedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT CK_Expense_Amount CHECK (mAmount > 0)
    );
END;
GO

/*==============================================================================
  7. VENTES ET PAIEMENTS
==============================================================================*/
-- 7.1 table transactionnelle principale qui sert à enregistrer les ventes réalisées dans un magasin.

IF OBJECT_ID('dbo.tblSale','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblSale (
        saleId              BIGINT IDENTITY(1,1) NOT NULL,
        vcSaleNumber          VARCHAR(20) NOT NULL,
        companyId           INT NOT NULL,
        storeId             INT NOT NULL,
        cashSessionId       INT NOT NULL,
        customerId          INT NULL,
        sellerUserId        INT NOT NULL,
        saleStatusId        INT NOT NULL,
        mGrossAmount         MONEY NOT NULL,
        mDiscountAmount      MONEY NOT NULL CONSTRAINT DF_Sale_DiscountAmount DEFAULT (0),
        mNetAmount           MONEY NOT NULL,
        mPaidAmount          MONEY NOT NULL CONSTRAINT DF_Sale_PaidAmount DEFAULT (0),
        mDebtAmount          MONEY NOT NULL CONSTRAINT DF_Sale_DebtAmount DEFAULT (0),
        dtSoldAt             DATETIME NOT NULL DEFAULT GETDATE(),
        IsCancelled        BIT NOT NULL CONSTRAINT DF_Sale_IsCancelled DEFAULT (0),
        cancelledByUserId   INT NULL,
        dtCancelledAt         DATETIME NULL,
        vcCancellationReason  VARCHAR(150) NULL,

        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_Sale PRIMARY KEY (saleId),
        CONSTRAINT FK_Sale_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_Sale_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_Sale_CashSession FOREIGN KEY (cashSessionId) REFERENCES dbo.tblCashSession(cashSessionId),
        CONSTRAINT FK_Sale_Customer FOREIGN KEY (customerId) REFERENCES dbo.tblCustomer(customerId),
        CONSTRAINT FK_Sale_Seller FOREIGN KEY (sellerUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_Sale_Status FOREIGN KEY (saleStatusId) REFERENCES dbo.tblRefSaleStatus(saleStatusId),
        CONSTRAINT FK_Sale_CancelledBy FOREIGN KEY (cancelledByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_Sale_Number UNIQUE (vcSaleNumber),
        CONSTRAINT CK_Sale_Amounts CHECK (
            mGrossAmount >= 0 AND mDiscountAmount >= 0 AND mNetAmount >= 0
            AND mPaidAmount >= 0 AND mDebtAmount >= 0
            AND mDiscountAmount <= mGrossAmount
            AND mPaidAmount + mDebtAmount = mNetAmount
        )
    );
END;
GO

CREATE INDEX IX_Sale_Store_SoldAt ON dbo.tblSale(storeId, dtSoldAt DESC);
GO
CREATE INDEX IX_Sale_Customer_SoldAt ON dbo.tblSale(customerId, dtSoldAt DESC) WHERE customerId IS NOT NULL;
GO

--7.2 table de détail transactionnelle qui sert à enregistrer les lignes de produits vendus dans une vente (liée à la table Sale).
IF OBJECT_ID('dbo.tblSaleDetail','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblSaleDetail (
        saleDetailId        BIGINT IDENTITY(1,1) NOT NULL,
        saleId              BIGINT NOT NULL,
        productId           BIGINT NOT NULL,
        stockLotId          INT NULL,
        dcQuantity            DECIMAL(18,3) NOT NULL,
        mUnitPurchasePrice   MONEY NULL,
        mUnitSalePrice       MONEY NOT NULL,
        mDiscountAmount      MONEY NOT NULL CONSTRAINT DF_SaleDetail_DiscountAmount DEFAULT (0),
        mLineAmount          DECIMAL(18,2) NOT NULL,
        CONSTRAINT PK_SaleDetail PRIMARY KEY  (saleDetailId),
        CONSTRAINT FK_SaleDetail_Sale FOREIGN KEY (saleId) REFERENCES dbo.tblSale(saleId),
        CONSTRAINT FK_SaleDetail_Product FOREIGN KEY (productId) REFERENCES dbo.tblProduct(productId),
        CONSTRAINT FK_SaleDetail_Lot FOREIGN KEY (stockLotId) REFERENCES dbo.tblStockLot(stockLotId),
        CONSTRAINT CK_SaleDetail_Values CHECK (
            dcQuantity > 0
            AND mUnitSalePrice >= 0
            AND (mUnitPurchasePrice IS NULL OR mUnitPurchasePrice >= 0)
            AND mDiscountAmount >= 0
            AND mLineAmount >= 0
        )
    );
END;
GO

CREATE INDEX IX_SaleDetail_SaleId ON dbo.tblSaleDetail(saleId);
GO
CREATE INDEX IX_SaleDetail_ProductId ON dbo.tblSaleDetail(productId);
GO

--7.3 table transactionnelle qui sert à enregistrer les paiements associés à une vente. 

IF OBJECT_ID('dbo.tblSalePayment','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblSalePayment (
        salePaymentId       BIGINT IDENTITY(1,1) NOT NULL,
        saleId              BIGINT NOT NULL,
        paymentMethodId     INT NOT NULL,
        paymentStatusId     INT NOT NULL,
        mAmount             MONEY NOT NULL,
        vcTransactionId       VARCHAR(150) NULL,
        vcOperatorReference   VARCHAR(150) NULL,
        vcPayerPhoneNumber    VARCHAR(20) NULL,
        vcCallbackPayload     VARCHAR(MAX) NULL,
        OperatorMessage     NVARCHAR(200) NULL,

        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_SalePayment PRIMARY KEY  (salePaymentId),
        CONSTRAINT FK_SalePayment_Sale FOREIGN KEY (saleId) REFERENCES dbo.tblSale(SaleId),
        CONSTRAINT FK_SalePayment_Method FOREIGN KEY (paymentMethodId) REFERENCES dbo.tblRefPaymentMethod(paymentMethodId),
        CONSTRAINT FK_SalePayment_Status FOREIGN KEY (paymentStatusId) REFERENCES dbo.tblRefPaymentStatus(paymentStatusId),
        CONSTRAINT CK_SalePayment_Amount CHECK (mAmount > 0)
    );
END;
GO

CREATE INDEX IX_SalePayment_TransactionId
ON dbo.tblSalePayment(vcTransactionId)
WHERE vcTransactionId IS NOT NULL;
GO

/*==============================================================================
  8. COMPTES TIERS, DETTES ET RECOUVREMENTS
==============================================================================*/
-- 8.1 table de gestion financière qui sert à suivre les comptes courants des tiers (clients ou fournisseurs) pour une entreprise. 
IF OBJECT_ID('dbo.tblThirdPartyAccount','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblThirdPartyAccount (
        thirdPartyAccountId INT IDENTITY(1,1) NOT NULL,
        companyId           INT NOT NULL,
        customerId          INT NULL,
        supplierId          INT NULL,
        dcCurrentBalance      DECIMAL(18,2) NOT NULL CONSTRAINT DF_ThirdPartyAccount_CurrentBalance DEFAULT (0),
        dtLastMovementAt      DATETIME NULL,
        btEnabled            BIT NOT NULL CONSTRAINT DF_ThirdPartyAccount_IsActive DEFAULT (1),
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
        RowVersion          ROWVERSION NOT NULL,
        CONSTRAINT PK_ThirdPartyAccount PRIMARY KEY  (thirdPartyAccountId),
        CONSTRAINT FK_ThirdPartyAccount_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_ThirdPartyAccount_Customer FOREIGN KEY (customerId) REFERENCES dbo.tblCustomer(customerId),
        CONSTRAINT FK_ThirdPartyAccount_Supplier FOREIGN KEY (supplierId) REFERENCES dbo.tblSupplier(supplierId),
        CONSTRAINT CK_ThirdPartyAccount_OneThirdParty CHECK (
            (customerId IS NOT NULL AND supplierId IS NULL)
            OR
            (customerId IS NULL AND supplierId IS NOT NULL)
        )
    );
END;
GO

CREATE UNIQUE INDEX UX_ThirdPartyAccount_Customer
ON dbo.tblThirdPartyAccount(companyId, customerId)
WHERE customerId IS NOT NULL;
GO

CREATE UNIQUE INDEX UX_ThirdPartyAccount_Supplier
ON dbo.tblThirdPartyAccount(companyId, supplierId)
WHERE supplierId IS NOT NULL;
GO
--8.2 table transactionnelle qui sert à enregistrer les paiements effectués pour régler des dettes liées aux comptes tiers (clients ou fournisseurs). 
IF OBJECT_ID('dbo.tblDebtPayment','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblDebtPayment (
        debtPaymentId       INT IDENTITY(1,1) NOT NULL,
        thirdPartyAccountId INT NOT NULL,
        storeId             INT NULL,
        cashSessionId       INT NULL,
        paymentMethodId     INT NOT NULL,
        paymentStatusId     INT NOT NULL,
        mAmount              MONEY NOT NULL,
        vcTransactionId       VARCHAR(150) NULL,
        vcOperatorReference   VARCHAR(150) NULL,
        vcPhoneNumber         VARCHAR(20) NULL,
        vcCallbackPayload     VARCHAR(MAX) NULL,
        OperatedByUserId    INT NOT NULL,
        vcNote                VARCHAR(150) NULL,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_DebtPayment PRIMARY KEY (debtPaymentId),
        CONSTRAINT FK_DebtPayment_ThirdPartyAccount FOREIGN KEY (thirdPartyAccountId) REFERENCES dbo.tblThirdPartyAccount(thirdPartyAccountId),
        CONSTRAINT FK_DebtPayment_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_DebtPayment_CashSession FOREIGN KEY (cashSessionId) REFERENCES dbo.tblCashSession(cashSessionId),
        CONSTRAINT FK_DebtPayment_Method FOREIGN KEY (paymentMethodId) REFERENCES dbo.tblRefPaymentMethod(paymentMethodId),
        CONSTRAINT FK_DebtPayment_Status FOREIGN KEY (paymentStatusId) REFERENCES dbo.tblRefPaymentStatus(paymentStatusId),
        CONSTRAINT FK_DebtPayment_OperatedBy FOREIGN KEY (operatedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT CK_DebtPayment_Amount CHECK (mAmount > 0)
    );
END;
GO
--8.3 table transactionnelle clé qui sert à enregistrer tous les mouvements financiers affectant les comptes tiers (clients ou fournisseurs).
IF OBJECT_ID('dbo.tblThirdPartyAccountMovement','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblThirdPartyAccountMovement (
        thirdPartyAccountMovementId INT IDENTITY(1,1) NOT NULL,
        thirdPartyAccountId INT NOT NULL,
        thirdPartyMovementTypeId INT NOT NULL,
        saleId              BIGINT NULL,
        purchaseId          INT NULL,
        debtPaymentId       INT NULL,
        storeId             INT NULL,
        mAmount              MONEY NOT NULL,
        mBalanceBefore       MONEY NOT NULL,
        mBalanceAfter        MONEY NOT NULL,
        operatedByUserId    INT NOT NULL,
        Note                NVARCHAR(150) NULL,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_ThirdPartyAccountMovement PRIMARY KEY (thirdPartyAccountMovementId),
        CONSTRAINT FK_ThirdPartyAccountMovement_Account FOREIGN KEY (thirdPartyAccountId) REFERENCES dbo.tblThirdPartyAccount(thirdPartyAccountId),
        CONSTRAINT FK_ThirdPartyAccountMovement_Type FOREIGN KEY (thirdPartyMovementTypeId) REFERENCES dbo.tblRefThirdPartyMovementType(thirdPartyMovementTypeId),
        CONSTRAINT FK_ThirdPartyAccountMovement_Sale FOREIGN KEY (saleId) REFERENCES dbo.tblSale(SaleId),
        CONSTRAINT FK_ThirdPartyAccountMovement_Purchase FOREIGN KEY (purchaseId) REFERENCES dbo.tblPurchase(purchaseId),
        CONSTRAINT FK_ThirdPartyAccountMovement_DebtPayment FOREIGN KEY (debtPaymentId) REFERENCES dbo.tblDebtPayment(debtPaymentId),
        CONSTRAINT FK_ThirdPartyAccountMovement_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_ThirdPartyAccountMovement_OperatedBy FOREIGN KEY (operatedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT CK_ThirdPartyAccountMovement_Amount CHECK (mAmount > 0)
    );
END;
GO

CREATE INDEX IX_ThirdPartyAccountMovement_Account_Date
ON dbo.tblThirdPartyAccountMovement(thirdPartyAccountId, dtCreatedAt DESC);
GO

/*==============================================================================
  9. RAPPORTS DE CAISSE ET TRESORERIE
==============================================================================*/
--9.1 table transactionnelle de synthèse qui sert à générer et stocker les rapports de caisse liés à une session de caisse (CashSession).
IF OBJECT_ID('dbo.tblCashReport','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblCashReport (
        cashReportId        INT IDENTITY(1,1) NOT NULL,
        cashSessionId       INT NOT NULL,
        cashReportStatusId  INT NOT NULL,
        mOpeningCashReport        MONEY NOT NULL,
        mTotalSales          MONEY NOT NULL,
        mTotalCash           MONEY NOT NULL,
        mTotalMobileMoney    MONEY NOT NULL,
        mTotalCredit         MONEY NOT NULL,
        mTotalRecoveries     MONEY NOT NULL,
        mTotalApprovedExpenses MONEY NOT NULL,
        mTheoreticalBalance  MONEY NOT NULL,
        mClosingAmount       MONEY NOT NULL,
        mDifferenceAmount    MONEY NOT NULL,
        managerApprovedByUserId INT NULL,
        dtManagerApprovedAt   DATETIME NULL,
        adminApprovedByUserId INT NULL,
        dtAdminApprovedAt     DATETIME NULL,
        vcManagerComment      VARCHAR(250) NULL,
        vcAdminComment        VARCHAR(250) NULL,

        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_CashReport PRIMARY KEY (cashReportId),
        CONSTRAINT FK_CashReport_CashSession FOREIGN KEY (cashSessionId) REFERENCES dbo.tblCashSession(cashSessionId),
        CONSTRAINT FK_CashReport_Status FOREIGN KEY (cashReportStatusId) REFERENCES dbo.tblRefCashReportStatus(cashReportStatusId),
        CONSTRAINT FK_CashReport_ManagerApprovedBy FOREIGN KEY (managerApprovedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_CashReport_AdminApprovedBy FOREIGN KEY (adminApprovedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_CashReport_CashSession UNIQUE (cashSessionId)
    );
END;
GO
--9.2 table de référence opérationnelle qui sert à gérer les comptes de trésorerie d’une entreprise.
IF OBJECT_ID('dbo.tblTreasuryAccount','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblTreasuryAccount (
        treasuryAccountId   INT IDENTITY(1,1) NOT NULL,
        companyId           INT NOT NULL,
        storeId             INT NULL,
        treasuryAccountTypeId INT NOT NULL,
        vcAccountName         VARCHAR(50) NOT NULL,
        mCurrentBalance      MONEY NOT NULL CONSTRAINT DF_TreasuryAccount_CurrentBalance DEFAULT (0),
        btEnabled            BIT NOT NULL CONSTRAINT DF_TreasuryAccount_btEnabled DEFAULT (1),
        
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
        RowVersion          ROWVERSION NOT NULL,

        CONSTRAINT PK_TreasuryAccount PRIMARY KEY (treasuryAccountId),
        CONSTRAINT FK_TreasuryAccount_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_TreasuryAccount_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_TreasuryAccount_Type FOREIGN KEY (treasuryAccountTypeId) REFERENCES dbo.tblRefTreasuryAccountType(treasuryAccountTypeId)
    );
END;
GO
--9.10  table transactionnelle qui sert à enregistrer les mouvements de trésorerie effectués sur les différents comptes financiers de l’entreprise (TreasuryAccount).
IF OBJECT_ID('dbo.tblTreasuryMovement','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblTreasuryMovement (
        treasuryMovementId  INT IDENTITY(1,1) NOT NULL,
        treasuryAccountId   INT NOT NULL,
        treasuryMovementTypeId INT NOT NULL,
        cashReportId        INT NULL,
        mAmount              MONEY NOT NULL,
        mBalanceBefore       MONEY NOT NULL,
        mBalanceAfter        MONEY NOT NULL,
        vcDescription         VARCHAR(150) NOT NULL,
        OperatedByUserId    INT NOT NULL,

        btEnabled BIT NOT NULL DEFAULT 1,
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_TreasuryMovement PRIMARY KEY (treasuryMovementId),
        CONSTRAINT FK_TreasuryMovement_Account FOREIGN KEY (treasuryAccountId) REFERENCES dbo.tblTreasuryAccount(treasuryAccountId),
        CONSTRAINT FK_TreasuryMovement_Type FOREIGN KEY (treasuryMovementTypeId) REFERENCES dbo.tblRefTreasuryMovementType(treasuryMovementTypeId),
        CONSTRAINT FK_TreasuryMovement_CashReport FOREIGN KEY (cashReportId) REFERENCES dbo.tblCashReport(cashReportId),
        CONSTRAINT FK_TreasuryMovement_OperatedBy FOREIGN KEY (operatedByUserId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT CK_TreasuryMovement_Amount CHECK (mAmount > 0)
    );
END;
GO

CREATE INDEX IX_TreasuryMovement_Account_Date
ON dbo.tblTreasuryMovement(treasuryAccountId, dtCreatedAt DESC);
GO

/*==============================================================================
  10. AUDIT
==============================================================================*/
--10.1 table de traçabilité et de sécurité qui sert à enregistrer toutes les actions effectuées par les utilisateurs ou le système sur les données. 
IF OBJECT_ID('dbo.tblAuditLog','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblAuditLog (
        auditLogId          BIGINT IDENTITY(1,1) NOT NULL,
        userId              INT NULL,
        companyId           INT NULL,
        storeId             INT NULL,
        vcActionName          VARCHAR(100) NOT NULL,
        tableName           SYSNAME NOT NULL,
        vcRecordId            VARCHAR(100) NULL,
        vcOldValuesJson       VARCHAR(MAX) NULL,
        vcNewValuesJson       VARCHAR(MAX) NULL,
        vcIpAddress           vARCHAR(30) NULL,
        vcUserAgent           VARCHAR(150) NULL,

        btEnabled            DATETIME2(0) NOT NULL CONSTRAINT DF_AuditLog_ActionAt DEFAULT (SYSUTCDATETIME()),
 
        dtCreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_AuditLog PRIMARY KEY (auditLogId),
        CONSTRAINT FK_AuditLog_User FOREIGN KEY (userId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_AuditLog_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_AuditLog_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT CK_AuditLog_OldValuesJson CHECK (vcOldValuesJson IS NULL OR ISJSON(vcOldValuesJson) = 1),
        CONSTRAINT CK_AuditLog_NewValuesJson CHECK (vcNewValuesJson IS NULL OR ISJSON(vcNewValuesJson) = 1)
    );
END;
GO

CREATE INDEX IX_AuditLog_User_Date ON dbo.tblAuditLog(userId, dtCreatedAt DESC);
GO
CREATE INDEX IX_AuditLog_Table_Record ON dbo.tblAuditLog(TableName, vcRecordId);
GO

/*==============================================================================
  11. INDEXES COMPLEMENTAIRES SUR LES FK FREQUENTES
==============================================================================*/

CREATE INDEX IX_UserCompany_CompanyId ON dbo.tblUserCompany(CompanyId);
CREATE INDEX IX_UserStore_StoreId ON dbo.tblUserStore(StoreId);
CREATE INDEX IX_Customer_CompanyId ON dbo.tblCustomer(CompanyId);
CREATE INDEX IX_Supplier_CompanyId ON dbo.tblSupplier(CompanyId);
CREATE INDEX IX_Product_CompanyId ON dbo.tblProduct(CompanyId);
CREATE INDEX IX_Product_CategoryId ON dbo.tblProduct(ProductCategoryId);
CREATE INDEX IX_SupplierProduct_ProductId ON dbo.tblSupplierProduct(ProductId);
CREATE INDEX IX_StoreProduct_ProductId ON dbo.tblStoreProduct(ProductId);
CREATE INDEX IX_StockLot_Store_Product ON dbo.tblStockLot(StoreId, ProductId);
CREATE INDEX IX_Purchase_Store_Date ON dbo.tblPurchase(StoreId, dtOrderAt DESC);
CREATE INDEX IX_Purchase_Supplier_Date ON dbo.tblPurchase(SupplierId, dtOrderAt DESC);
CREATE INDEX IX_StockTransfer_SourceStore ON dbo.tblStockTransfer(SourceStoreId, dtCreatedAt DESC);
CREATE INDEX IX_StockTransfer_DestinationStore ON dbo.tblStockTransfer(DestinationStoreId, dtCreatedAt DESC);
CREATE INDEX IX_Expense_Store_Date ON dbo.tblExpense(StoreId, dtCreatedAt DESC);
GO

/*==============================================================================
  12. DONNEES INITIALES DES REFERENTIELS
==============================================================================*/

INSERT INTO dbo.tblRefRole (vcCode, vcRole) VALUES
('SUPER_ADMIN', N'Super administrateur'),
('ADMIN',       N'Administrateur'),
('MANAGER',     N'Gérant'),
('CASHIER',     N'Caissier');
GO

INSERT INTO dbo.tblRefGender (vcCode, vcGender) VALUES
('M', N'Masculin'),
('F', N'Féminin');
GO

INSERT INTO dbo.tblRefCustomerType (vcCode, vcCustomerType) VALUES
('INDIVIDUAL', N'Particulier'),
('BUSINESS',   N'Entreprise');
GO

INSERT INTO dbo.tblRefStoreType (vcCode, vcStoreType) VALUES
('STORE',     N'Boutique Pricipale'),
('SECONDARY', N'Secondaire');
GO

INSERT INTO dbo.tblRefPaymentMethod (vcCode, vcPaymentMethod ) VALUES
('CASH',         N'Espèces'),
('ORANGE_MONEY', N'Orange Money'),
('MTN_MOMO',     N'MTN MoMo'),
('CARD',         N'Carte bancaire'),
('BANK_TRANSFER',N'Virement');
GO

INSERT INTO dbo.tblRefPaymentStatus (vcCode, vcPaymentStatus) VALUES
('PENDING', N'En attente'),
('SUCCESS', N'Succès'),
('FAILED',  N'Échec'),
('CANCELLED', N'Annulé');
GO

INSERT INTO dbo.tblRefSaleStatus (vcCode, vcSaleStatus) VALUES
('DRAFT',     N'Brouillon'),
('VALIDATED', N'Validée'),
('CANCELLED', N'Annulée');
GO

INSERT INTO dbo.tblRefDiscountType (vcCode, vcDiscountType) VALUES
('PERCENTAGE', N'Pourcentage'),
('FIXED_AMOUNT', N'Montant fixe');
GO

INSERT INTO dbo.tblRefCashSessionStatus (vcCode, vcCashSessionStatus) VALUES
('OPEN',   N'Ouverte'),
('CLOSED', N'Fermée');
GO

INSERT INTO dbo.tblRefStockMovementType (vcCode, vcStockMovementType, direction) VALUES
('PURCHASE_RECEIPT', N'Entrée approvisionnement',  1),
('SALE',             N'Sortie vente',             -1),
('TRANSFER_OUT',     N'Sortie transfert',         -1),
('TRANSFER_IN',      N'Entrée transfert',           1),
('ADJUSTMENT_IN',    N'Ajustement positif',         1),
('ADJUSTMENT_OUT',   N'Ajustement négatif',        -1),
('SALE_CANCEL',      N'Annulation de vente',         1),
('RETURN_TO_SUPPLIER',N'Retour fournisseur',        -1);
GO

INSERT INTO dbo.tblRefTransferStatus (vcCode, vcTransferStatus) VALUES
('DRAFT',     N'Brouillon'),
('PENDING',   N'En attente'),
('APPROVED',  N'Validé'),
('SHIPPED',   N'Expédié'),
('RECEIVED',  N'Reçu'),
('CANCELLED', N'Annulé');
GO

INSERT INTO dbo.tblRefThirdPartyMovementType (vcCode, vcThirdPartyMovementType, direction) VALUES
('CUSTOMER_DEBT',       N'Dette client',             1),
('CUSTOMER_PAYMENT',    N'Remboursement client',    -1),
('SUPPLIER_DEBT',       N'Dette fournisseur',        1),
('SUPPLIER_PAYMENT',    N'Paiement fournisseur',    -1);
GO

INSERT INTO dbo.tblRefAdjustmentReason (vcCode, vcAdjustmentReason) VALUES
('THEFT',           N'Vol'),
('LOSS',            N'Perte'),
('BREAKAGE',        N'Casse'),
('INVENTORY_ERROR', N'Erreur inventaire'),
('EXPIRED',         N'Péremption'),
('OTHER',           N'Autre');
GO

INSERT INTO dbo.tblRefAdjustmentStatus (vcCode, vcAdjustmentStatus) VALUES
('PENDING',  N'En attente'),
('APPROVED', N'Validé'),
('REJECTED', N'Rejeté');
GO

INSERT INTO dbo.tblRefCashReportStatus (vcCode, vcCashReportStatus) VALUES
('PENDING_MANAGER', N'En attente validation gérant'),
('PENDING_ADMIN',   N'En attente validation admin'),
('APPROVED',        N'Validé'),
('REJECTED',        N'Rejeté');
GO

INSERT INTO dbo.tblRefPurchaseStatus (vcCode, vcPurchaseStatus) VALUES
('DRAFT',     N'Brouillon'),
('ORDERED',   N'Commandé'),
('PARTIAL',   N'Partiellement reçu'),
('RECEIVED',  N'Reçu'),
('CANCELLED', N'Annulé');
GO

INSERT INTO dbo.tblRefInventoryStatus (vcCode, vcInventoryStatus) VALUES
('OPEN',      N'Ouvert'),
('COUNTED',   N'Compté'),
('VALIDATED', N'Validé'),
('CANCELLED', N'Annulé');
GO

INSERT INTO dbo.tblRefRegistrationRequestStatus (vcCode, vcRegistrationRequestStatus) VALUES
('PENDING',  N'En attente'),
('APPROVED', N'Acceptée'),
('REJECTED', N'Rejetée');
GO

INSERT INTO dbo.tblRefUnitOfMeasure (vcCode, vcUnitOfMeasure, vcSymbol) VALUES
('UNIT',   N'Unité',  N'u'),
('KG',     N'Kilogramme', N'kg'),
('LITER',  N'Litre', N'L'),
('CARTON', N'Carton', N'carton'),
('PACK',   N'Pack', N'pack');
GO

INSERT INTO dbo.tblRefTreasuryAccountType (vcCode, vcTreasuryAccountType) VALUES
('CENTRAL_CASH', N'Caisse centrale'),
('STORE_CASH',   N'Caisse boutique'),
('ORANGE_MONEY', N'Compte Orange Money'),
('MTN_MOMO',     N'Compte MTN MoMo'),
('BANK',         N'Compte bancaire');
GO

INSERT INTO dbo.tblRefTreasuryMovementType (vcCode, vcTreasuryMovementType, direction) VALUES
('CASH_REPORT_IN', N'Entrée depuis rapport de caisse', 1),
('MANUAL_IN',      N'Entrée manuelle',                  1),
('MANUAL_OUT',     N'Sortie manuelle',                 -1),
('BANK_DEPOSIT',   N'Dépôt bancaire',                  -1),
('BANK_WITHDRAWAL',N'Retrait bancaire',                 1);
GO


/*==============================================================================
  14. NOTIFICATIONS
==============================================================================*/

--14.1 Table de référence pour définir les différents types de notifications
-- Elle permet d'éviter d'enregistrer directement les libellés des types
-- de notifications dans la table principale.
IF OBJECT_ID('dbo.tblRefNotificationType','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRefNotificationType (
        notificationTypeId   INT IDENTITY(1,1) NOT NULL,
        vcCode               VARCHAR(20) NOT NULL,
        vcNotificationType   VARCHAR(30) NOT NULL,
        vcDescription        VARCHAR(200) NULL,
        btEnabled            BIT NOT NULL DEFAULT 1,

        CONSTRAINT PK_tblRefNotificationType
            PRIMARY KEY (notificationTypeId),

        CONSTRAINT UQ_tblRefNotificationType_Code
            UNIQUE (vcCode)
    );
END;
GO


--14.2 Table principale qui sert à gérer les notifications destinées
-- aux utilisateurs de l'application.
-- Une notification peut être liée à une entreprise, une boutique
-- et à un objet métier comme un produit, une vente, un transfert,
-- un rapport de caisse, un approvisionnement, etc.
IF OBJECT_ID('dbo.tblNotification','U') IS NULL
BEGIN
    CREATE TABLE dbo.tblNotification (
        notificationId       BIGINT IDENTITY(1,1) NOT NULL,

        -- Utilisateur destinataire de la notification
        userId               INT NOT NULL,

        -- Contexte de la notification
        companyId            INT NULL,
        storeId              INT NULL,

        -- Type de notification
        notificationTypeId   INT NOT NULL,

        -- Contenu affiché à l'utilisateur
        vcTitle              VARCHAR(150) NOT NULL,
        vcMessage            NVARCHAR(500) NOT NULL,

        -- Priorité : LOW, NORMAL, HIGH ou URGENT
        vcPriority           VARCHAR(20) NOT NULL DEFAULT 'NORMAL',

        
        vcReferenceType      VARCHAR(50) NULL,
        referenceId          BIGINT NULL,

        vcActionUrl          VARCHAR(255) NULL,

       
        btIsRead             BIT NOT NULL DEFAULT 0,
        dtReadAt             DATETIME NULL,

       
        dtCreatedAt          DATETIME NOT NULL DEFAULT GETDATE(),
        dtExpiresAt          DATETIME NULL,

        btEnabled            BIT NOT NULL DEFAULT 1,

        CONSTRAINT PK_tblNotification PRIMARY KEY (notificationId),
        CONSTRAINT FK_tblNotification_User FOREIGN KEY (userId) REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_tblNotification_Company FOREIGN KEY (companyId) REFERENCES dbo.tblCompany(companyId),
        CONSTRAINT FK_tblNotification_Store FOREIGN KEY (storeId) REFERENCES dbo.tblStore(storeId),
        CONSTRAINT FK_tblNotification_NotificationType FOREIGN KEY (notificationTypeId) REFERENCES dbo.tblRefNotificationType(notificationTypeId),

        -- Vérifie les valeurs autorisées pour la priorité.
        CONSTRAINT CK_tblNotification_Priority
            CHECK (vcPriority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),

        -- Si une notification est marquée comme lue,
        -- la date de lecture doit être renseignée.
        CONSTRAINT CK_tblNotification_Read
            CHECK (
                (btIsRead = 0 AND dtReadAt IS NULL)
                OR
                (btIsRead = 1 AND dtReadAt IS NOT NULL)
            ),

        -- La date d'expiration ne peut pas être antérieure
        -- à la date de création.
        CONSTRAINT CK_tblNotification_Expiration
            CHECK (
                dtExpiresAt IS NULL
                OR dtExpiresAt >= dtCreatedAt
            )
    );
END;
GO


--14.3 Index pour récupérer rapidement les notifications
-- d'un utilisateur, principalement les notifications non lues.
CREATE INDEX IX_tblNotification_User_IsRead_CreatedAt
ON dbo.tblNotification (
    userId,
    btIsRead,
    dtCreatedAt DESC
);
GO


-- Index pour consulter les notifications liées à une boutique.
CREATE INDEX IX_tblNotification_Store_CreatedAt
ON dbo.tblNotification (
    storeId,
    dtCreatedAt DESC
)
WHERE storeId IS NOT NULL;
GO


-- Index permettant de retrouver les notifications associées
-- à une ressource métier précise.
CREATE INDEX IX_tblNotification_Reference
ON dbo.tblNotification (
    vcReferenceType,
    referenceId
)
WHERE referenceId IS NOT NULL;
GO


/*==============================================================================
  15. DONNEES INITIALES DES TYPES DE NOTIFICATIONS
==============================================================================*/

-- Notifications liées au stock
INSERT INTO dbo.tblRefNotificationType
(
    vcCode,
    vcNotificationType,
    vcDescription
)
VALUES
(
    'LOW_STOCK',
    'Stock faible',
    'Notification générée lorsqu''un produit atteint son seuil minimum de stock.'
),
(
    'OUT_OF_STOCK',
    'Rupture de stock',
    'Notification générée lorsqu''un produit n''est plus disponible en stock.'
),
(
    'EXPIRATION_ALERT',
    'Alerte de péremption',
    'Notification générée lorsqu''un lot de produit approche de sa date de péremption.'
),

-- Notifications liées aux transferts de stock
(
    'TRANSFER_REQUEST',
    'Demande de transfert',
    'Notification générée lors d''une nouvelle demande de transfert entre boutiques.'
),
(
    'TRANSFER_APPROVED',
    'Transfert validé',
    'Notification générée lorsqu''un transfert de stock est validé.'
),
(
    'TRANSFER_RECEIVED',
    'Transfert réceptionné',
    'Notification générée lorsqu''un transfert est réceptionné par la boutique destinataire.'
),

-- Notifications liées aux ajustements de stock
(
    'ADJUSTMENT_REQUEST',
    'Demande d''ajustement',
    'Notification générée lorsqu''un ajustement de stock nécessite une validation.'
),
(
    'ADJUSTMENT_APPROVED',
    'Ajustement validé',
    'Notification générée lorsqu''un ajustement de stock est accepté.'
),
(
    'ADJUSTMENT_REJECTED',
    'Ajustement rejeté',
    'Notification générée lorsqu''un ajustement de stock est rejeté.'
),

-- Notifications liées aux caisses
(
    'CASH_REPORT_PENDING',
    'Rapport de caisse à valider',
    'Notification générée lorsqu''un rapport de caisse attend une validation.'
),
(
    'CASH_DIFFERENCE',
    'Ecart de caisse',
    'Notification générée lorsqu''un écart est constaté lors de la clôture d''une caisse.'
),

-- Notifications liées aux dettes et paiements
(
    'DEBT_DUE',
    'Echéance de dette',
    'Notification générée pour signaler une dette arrivée ou proche de son échéance.'
),
(
    'PAYMENT_SUCCESS',
    'Paiement réussi',
    'Notification générée après la confirmation d''un paiement.'
),
(
    'PAYMENT_FAILED',
    'Paiement échoué',
    'Notification générée lorsqu''un paiement échoue.'
),

-- Notifications liées aux approvisionnements
(
    'PURCHASE_RECEIVED',
    'Approvisionnement réceptionné',
    'Notification générée après la réception d''un approvisionnement.'
),

-- Notifications liées aux utilisateurs et aux administrateurs
(
    'ADMIN_REGISTRATION',
    'Demande inscription administrateur',
    'Notification destinée au SuperAdmin lorsqu''un nouvel administrateur demande son inscription.'
);
GO

