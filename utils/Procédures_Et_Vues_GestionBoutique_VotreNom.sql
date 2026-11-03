/*
  Couche de lecture et procédures SQL Server pour API-gestion-stock.
  A exécuter après le script de création des tables dbo.tbl*.

  Les objets ci-dessous s'appuient sur les noms/colonnes effectivement utilisés
  par les DAL modernes (productDAL, saleDAL, storeStockDAL, etc.). Le dépôt
  contient aussi articleDAL, une ancienne variante de tblProduct avec un
  modèle de colonnes incompatible; elle n'est pas incluse ici.
  Les DAL actuels exécutent principalement leurs INSERT/UPDATE directement:
  ces procédures sont disponibles pour centraliser des lectures/opérations
  atomiques, mais leur adoption demande de remplacer les appels DAL concernés.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Catalogue actif par boutique, prix et stock disponibles. */
CREATE OR ALTER VIEW dbo.vw_StoreProductCatalog
AS
	SELECT
		sp.storeId,
		s.companyId,
		sp.productId,
		p.productCategoryId,
		c.vcCategoryCode,
		c.vcCategoryName,
		p.unitOfMeasureId,
		u.vcSymbol AS unitSymbol,
		p.vcProductCode,
		p.vcProductName,
		p.vcDescription,
		p.vcBarcode,
		p.vcImageUrl,
		sp.mCurrentSalePrice,
		COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold, 0) AS alertThreshold,
		COALESCE(k.dcAvailableQuantity, 0) AS dcAvailableQuantity,
		COALESCE(k.dcReservedQuantity, 0) AS dcReservedQuantity
	FROM dbo.tblStoreProduct AS sp
	INNER JOIN dbo.tblStore AS s ON s.storeId = sp.storeId
	INNER JOIN dbo.tblProduct AS p ON p.productId = sp.productId
	INNER JOIN dbo.tblProductCategory AS c ON c.productCategoryId = p.productCategoryId
	LEFT JOIN dbo.tblRefUnitOfMeasure AS u ON u.unitOfMeasureId = p.unitOfMeasureId
	LEFT JOIN dbo.tblStoreStock AS k
		ON k.storeId = sp.storeId AND k.productId = sp.productId
	WHERE sp.btEnabled = 1 AND p.btEnabled = 1;
GO

/* Stocks boutique avec seuil effectif et indicateur de réapprovisionnement. */
CREATE OR ALTER VIEW dbo.vw_StoreStockStatus
AS
	SELECT
		k.storeStockId,
		k.storeId,
		s.companyId,
		k.productId,
		p.vcProductCode,
		p.vcProductName,
		k.dcAvailableQuantity,
		k.dcReservedQuantity,
		COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold, 0) AS alertThreshold,
		CONVERT(bit, CASE
			WHEN k.dcAvailableQuantity <= COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold, 0)
			THEN 1 ELSE 0 END) AS isLowStock,
		k.dtUpdatedAt
	FROM dbo.tblStoreStock AS k
	INNER JOIN dbo.tblStore AS s ON s.storeId = k.storeId
	INNER JOIN dbo.tblProduct AS p ON p.productId = k.productId
	LEFT JOIN dbo.tblStoreProduct AS sp
		ON sp.storeId = k.storeId AND sp.productId = k.productId;
GO

/* Ventes enrichies avec le client, le vendeur et le statut. */
CREATE OR ALTER VIEW dbo.vw_SaleOverview
AS
	SELECT
		sa.saleId,
		sa.vcSaleNumber,
		sa.companyId,
		sa.storeId,
		st.vcStoreName,
		sa.cashSessionId,
		sa.customerId,
		CASE WHEN cu.customerId IS NULL THEN NULL
			 ELSE LTRIM(RTRIM(COALESCE(cu.vcLastName, '') + ' ' + COALESCE(cu.vcFirstName, ''))) END AS customerName,
		sa.sellerUserId,
		LTRIM(RTRIM(COALESCE(us.vcLastName, '') + ' ' + COALESCE(us.vcFirstName, ''))) AS sellerName,
		sa.saleStatusId,
		rs.vcCode AS statusCode,
		rs.vcSaleStatus,
		sa.mGrossAmount,
		sa.mDiscountAmount,
		sa.mNetAmount,
		sa.mPaidAmount,
		sa.mDebtAmount,
		sa.dtSoldAt,
		sa.IsCancelled,
		sa.dtCancelledAt,
		sa.vcCancellationReason,
		sa.btEnabled
	FROM dbo.tblSale AS sa
	INNER JOIN dbo.tblStore AS st ON st.storeId = sa.storeId
	INNER JOIN dbo.tblRefSaleStatus AS rs ON rs.saleStatusId = sa.saleStatusId
	INNER JOIN dbo.tblUser AS us ON us.userId = sa.sellerUserId
	LEFT JOIN dbo.tblCustomer AS cu ON cu.customerId = sa.customerId;
GO

/* Lignes de vente, avec le code et le nom produit. */
CREATE OR ALTER VIEW dbo.vw_SaleLine
AS
	SELECT
		d.saleId,
		s.vcSaleNumber,
		s.companyId,
		s.storeId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.stockLotId,
		d.dcQuantity,
		d.mUnitPurchasePrice,
		d.mUnitSalePrice,
		d.mDiscountAmount,
		d.mLineAmount
	FROM dbo.tblSaleDetail AS d
	INNER JOIN dbo.tblSale AS s ON s.saleId = d.saleId
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO

/* Paiements de vente détaillés. */
CREATE OR ALTER VIEW dbo.vw_SalePaymentOverview
AS
	SELECT
		sp.salePaymentId,
		sp.saleId,
		s.vcSaleNumber,
		s.storeId,
		sp.paymentMethodId,
		pm.vcCode AS methodCode,
		pm.vcPaymentMethod,
		sp.paymentStatusId,
		ps.vcCode AS statusCode,
		ps.vcPaymentStatus,
		sp.mAmount,
		sp.vcTransactionId,
		sp.vcOperatorReference,
		sp.vcPayerPhoneNumber,
		sp.dtCreatedAt
	FROM dbo.tblSalePayment AS sp
	INNER JOIN dbo.tblSale AS s ON s.saleId = sp.saleId
	INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = sp.paymentMethodId
	INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = sp.paymentStatusId;
GO

/* Bons d'achat avec fournisseur, boutique et statut. */
CREATE OR ALTER VIEW dbo.vw_PurchaseOverview
AS
	SELECT
		p.purchaseId,
		p.vcPurchaseNumber,
		p.supplierId,
		COALESCE(s.vcBusinessName, LTRIM(RTRIM(COALESCE(s.vcLastName, '') + ' ' + COALESCE(s.vcFirstName, '')))) AS supplierName,
		p.storeId,
		st.vcStoreName,
		st.companyId,
		p.purchaseStatusId,
		rs.vcCode AS statusCode,
		rs.vcPurchaseStatus,
		p.dtOrderAt,
		p.dtReceivedAt,
		p.mTotalAmount,
		p.createdByUserId,
		p.receivedByUserId,
		p.btEnabled
	FROM dbo.tblPurchase AS p
	INNER JOIN dbo.tblSupplier AS s ON s.supplierId = p.supplierId
	INNER JOIN dbo.tblStore AS st ON st.storeId = p.storeId
	INNER JOIN dbo.tblRefPurchaseStatus AS rs ON rs.purchaseStatusId = p.purchaseStatusId;
GO

/* Détails des bons d'achat. */
CREATE OR ALTER VIEW dbo.vw_PurchaseLine
AS
	SELECT
		d.purchaseId,
		p.vcPurchaseNumber,
		p.storeId,
		d.purchaseDetailId,
		d.productId,
		pr.vcProductCode,
		pr.vcProductName,
		d.dcOrderedQuantity,
		d.dcReceivedQuantity,
		d.mUnitPurchasePrice,
		d.vcLotNumber,
		d.dtExpirationAt
	FROM dbo.tblPurchaseDetail AS d
	INNER JOIN dbo.tblPurchase AS p ON p.purchaseId = d.purchaseId
	INNER JOIN dbo.tblProduct AS pr ON pr.productId = d.productId;
GO

/* Sessions de caisse avec caisse, utilisateur et statut. */
CREATE OR ALTER VIEW dbo.vw_CashSessionOverview
AS
	SELECT
		cs.cashSessionId,
		cr.cashRegisterId,
		cr.storeId,
		st.companyId,
		cr.vcRegisterCode,
		cr.vcRegisterName,
		cs.userId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS cashierName,
		cs.cashSessionStatusId,
		rs.vcCode AS statusCode,
		rs.vcCashSessionStatus,
		cs.mOpeningCaisse,
		cs.dtOpenedAt,
		cs.dtClosedAt,
		cs.mDeclaredClosingAmount,
		cs.IsReportGenerated
	FROM dbo.tblCashSession AS cs
	INNER JOIN dbo.tblCashRegister AS cr ON cr.cashRegisterId = cs.cashRegisterId
	INNER JOIN dbo.tblStore AS st ON st.storeId = cr.storeId
	INNER JOIN dbo.tblUser AS u ON u.userId = cs.userId
	INNER JOIN dbo.tblRefCashSessionStatus AS rs ON rs.cashSessionStatusId = cs.cashSessionStatusId;
GO

/* Synthèse de caisse sans multiplication des montants par les jointures 1-N. */
CREATE OR ALTER VIEW dbo.vw_CashSessionTotals
AS
	WITH PaidBySale AS (
		SELECT
			sp.saleId,
			SUM(CASE WHEN pm.vcCode = 'CASH' THEN sp.mAmount ELSE 0 END) AS cashPaid,
			SUM(CASE WHEN pm.vcCode IN ('ORANGE_MONEY', 'MTN_MOMO') THEN sp.mAmount ELSE 0 END) AS mobilePaid
		FROM dbo.tblSalePayment AS sp
		INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = sp.paymentStatusId
		INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = sp.paymentMethodId
		WHERE ps.vcCode = 'SUCCESS'
		GROUP BY sp.saleId
	), SalesBySession AS (
		SELECT
			sa.cashSessionId,
			SUM(sa.mNetAmount) AS mTotalSales,
			SUM(COALESCE(pay.cashPaid, 0)) AS mTotalCash,
			SUM(COALESCE(pay.mobilePaid, 0)) AS mTotalMobileMoney,
			SUM(sa.mDebtAmount) AS mTotalCredit
		FROM dbo.tblSale AS sa
		LEFT JOIN PaidBySale AS pay ON pay.saleId = sa.saleId
		WHERE sa.IsCancelled = 0
		GROUP BY sa.cashSessionId
	), RecoveriesBySession AS (
		SELECT dp.cashSessionId, SUM(dp.mAmount) AS mTotalRecoveries
		FROM dbo.tblDebtPayment AS dp
		INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = dp.paymentStatusId
		WHERE ps.vcCode = 'SUCCESS'
		GROUP BY dp.cashSessionId
	), ApprovedExpensesBySession AS (
		SELECT e.cashSessionId, SUM(e.mAmount) AS mTotalApprovedExpenses
		FROM dbo.tblExpense AS e
		WHERE e.vcStatusCode = 'APPROVED'
		GROUP BY e.cashSessionId
	)
	SELECT
		cs.cashSessionId,
		cs.cashRegisterId,
		cr.storeId,
		COALESCE(sales.mTotalSales, 0) AS mTotalSales,
		COALESCE(sales.mTotalCash, 0) AS mTotalCash,
		COALESCE(sales.mTotalMobileMoney, 0) AS mTotalMobileMoney,
		COALESCE(sales.mTotalCredit, 0) AS mTotalCredit,
		COALESCE(recoveries.mTotalRecoveries, 0) AS mTotalRecoveries,
		COALESCE(expenses.mTotalApprovedExpenses, 0) AS mTotalApprovedExpenses,
		cs.mOpeningCaisse + COALESCE(sales.mTotalCash, 0) - COALESCE(expenses.mTotalApprovedExpenses, 0) AS mTheoreticalBalance
	FROM dbo.tblCashSession AS cs
	INNER JOIN dbo.tblCashRegister AS cr ON cr.cashRegisterId = cs.cashRegisterId
	LEFT JOIN SalesBySession AS sales ON sales.cashSessionId = cs.cashSessionId
	LEFT JOIN RecoveriesBySession AS recoveries ON recoveries.cashSessionId = cs.cashSessionId
	LEFT JOIN ApprovedExpensesBySession AS expenses ON expenses.cashSessionId = cs.cashSessionId;
GO

/* Dépenses enrichies avec catégorie et noms des opérateurs. */
CREATE OR ALTER VIEW dbo.vw_ExpenseOverview
AS
	SELECT
		e.expenseId,
		e.cashSessionId,
		e.storeId,
		s.companyId,
		e.expenseCategoryId,
		ec.vcExpenseCategoryCode,
		ec.vcExpenseCategory,
		e.mAmount,
		e.vcReason,
		e.vcProofUrl,
		e.vcStatusCode,
		e.createdByUserId,
		LTRIM(RTRIM(COALESCE(cu.vcLastName, '') + ' ' + COALESCE(cu.vcFirstName, ''))) AS createdByName,
		e.approvedByUserId,
		LTRIM(RTRIM(COALESCE(au.vcLastName, '') + ' ' + COALESCE(au.vcFirstName, ''))) AS approvedByName,
		e.dtApprovedAt,
		e.dtCreatedAt
	FROM dbo.tblExpense AS e
	INNER JOIN dbo.tblStore AS s ON s.storeId = e.storeId
	INNER JOIN dbo.tblExpenseCategory AS ec ON ec.expenseCategoryId = e.expenseCategoryId
	INNER JOIN dbo.tblUser AS cu ON cu.userId = e.createdByUserId
	LEFT JOIN dbo.tblUser AS au ON au.userId = e.approvedByUserId;
GO

/* Mouvements de stock enrichis avec produit, boutique, type et utilisateur. */
CREATE OR ALTER VIEW dbo.vw_StockMovementOverview
AS
	SELECT
		m.stockMovementId,
		m.storeId,
		s.companyId,
		m.productId,
		p.vcProductCode,
		p.vcProductName,
		m.stockLotId,
		m.stockMovementTypeId,
		t.vcCode AS movementCode,
		t.vcStockMovementType,
		m.dcQuantity,
		m.dcStockBefore,
		m.dcStockAfter,
		m.vcReferenceType,
		m.referenceId,
		m.operatedByUserId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS operatedByName,
		m.dtMovementAt,
		m.vcComment
	FROM dbo.tblStockMovement AS m
	INNER JOIN dbo.tblStore AS s ON s.storeId = m.storeId
	INNER JOIN dbo.tblProduct AS p ON p.productId = m.productId
	INNER JOIN dbo.tblRefStockMovementType AS t ON t.stockMovementTypeId = m.stockMovementTypeId
	INNER JOIN dbo.tblUser AS u ON u.userId = m.operatedByUserId;
GO

/* Ajustements de stock avec motif et statut. */
CREATE OR ALTER VIEW dbo.vw_StockAdjustmentOverview
AS
	SELECT
		a.stockAdjustmentId,
		a.storeId,
		st.companyId,
		a.adjustmentReasonId,
		rr.vcCode AS reasonCode,
		rr.vcAdjustmentReason,
		a.adjustmentStatusId,
		rs.vcCode AS statusCode,
		rs.vcAdjustmentStatus,
		a.vcJustification,
		a.vcProofImageUrl,
		a.createdByUserId,
		a.approvedByUserId,
		a.dtcreatedAt,
		a.dtApprovedAt,
		a.vcApprovalComment
	FROM dbo.tblStockAdjustment AS a
	INNER JOIN dbo.tblStore AS st ON st.storeId = a.storeId
	INNER JOIN dbo.tblRefAdjustmentReason AS rr ON rr.adjustmentReasonId = a.adjustmentReasonId
	INNER JOIN dbo.tblRefAdjustmentStatus AS rs ON rs.adjustmentStatusId = a.adjustmentStatusId;
GO

/* Transferts inter-boutiques avec les deux sites et le statut. */
CREATE OR ALTER VIEW dbo.vw_StockTransferOverview
AS
	SELECT
		t.stockTransferId,
		t.vcTransferNumber,
		t.sourceStoreId,
		src.companyId AS sourceCompanyId,
		src.vcStoreName AS sourceStoreName,
		t.destinationStoreId,
		dst.companyId AS destinationCompanyId,
		dst.vcStoreName AS destinationStoreName,
		t.transferStatusId,
		rs.vcCode AS statusCode,
		rs.vcTransferStatus,
		t.createdByUserId,
		t.approvedByUserId,
		t.vcCarrierName,
		t.dtCreatedAt,
		t.dtShippedAt,
		t.dtReceivedAt,
		t.IsCancelled,
		t.vcCancellationReason
	FROM dbo.tblStockTransfer AS t
	INNER JOIN dbo.tblStore AS src ON src.storeId = t.sourceStoreId
	INNER JOIN dbo.tblStore AS dst ON dst.storeId = t.destinationStoreId
	INNER JOIN dbo.tblRefTransferStatus AS rs ON rs.transferStatusId = t.transferStatusId;
GO

/* Comptes tiers et identité client/fournisseur associée. */
CREATE OR ALTER VIEW dbo.vw_ThirdPartyAccountOverview
AS
	SELECT
		a.thirdPartyAccountId,
		a.companyId,
		a.customerId,
		LTRIM(RTRIM(COALESCE(c.vcLastName, '') + ' ' + COALESCE(c.vcFirstName, ''))) AS customerName,
		a.supplierId,
		COALESCE(s.vcBusinessName, LTRIM(RTRIM(COALESCE(s.vcLastName, '') + ' ' + COALESCE(s.vcFirstName, '')))) AS supplierName,
		a.dcCurrentBalance,
		a.dtLastMovementAt,
		a.btEnabled,
		a.dtCreatedAt
	FROM dbo.tblThirdPartyAccount AS a
	LEFT JOIN dbo.tblCustomer AS c ON c.customerId = a.customerId
	LEFT JOIN dbo.tblSupplier AS s ON s.supplierId = a.supplierId;
GO

/* Mouvements des comptes tiers. */
CREATE OR ALTER VIEW dbo.vw_ThirdPartyAccountMovement
AS
	SELECT
		m.thirdPartyAccountMovementId,
		m.thirdPartyAccountId,
		a.companyId,
		a.customerId,
		a.supplierId,
		m.thirdPartyMovementTypeId,
		t.vcCode AS movementCode,
		t.vcThirdPartyMovementType,
		t.direction,
		m.saleId,
		m.purchaseId,
		m.debtPaymentId,
		m.storeId,
		m.mAmount,
		m.mBalanceBefore,
		m.mBalanceAfter,
		m.operatedByUserId,
		m.Note,
		m.dtCreatedAt
	FROM dbo.tblThirdPartyAccountMovement AS m
	INNER JOIN dbo.tblThirdPartyAccount AS a ON a.thirdPartyAccountId = m.thirdPartyAccountId
	INNER JOIN dbo.tblRefThirdPartyMovementType AS t ON t.thirdPartyMovementTypeId = m.thirdPartyMovementTypeId;
GO

/* Notifications visibles, non expirées, avec leur type. */
CREATE OR ALTER VIEW dbo.vw_ActiveNotification
AS
	SELECT
		n.notificationId,
		n.userId,
		n.companyId,
		n.storeId,
		n.notificationTypeId,
		t.vcCode AS typeCode,
		t.vcNotificationType,
		n.vcTitle,
		n.vcMessage,
		n.vcPriority,
		n.vcReferenceType,
		n.referenceId,
		n.vcActionUrl,
		n.btIsRead,
		n.dtReadAt,
		n.dtCreatedAt,
		n.dtExpiresAt
	FROM dbo.tblNotification AS n
	LEFT JOIN dbo.tblRefNotificationType AS t ON t.notificationTypeId = n.notificationTypeId
	WHERE n.btEnabled = 1
	  AND (n.dtExpiresAt IS NULL OR n.dtExpiresAt > SYSUTCDATETIME());
GO

/* Journal d'audit prêt à être filtré par entreprise, boutique et utilisateur. */
CREATE OR ALTER VIEW dbo.vw_AuditLogOverview
AS
	SELECT
		a.auditLogId,
		a.userId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS userName,
		a.companyId,
		c.vcCompanyName,
		a.storeId,
		s.vcStoreName,
		a.vcActionName,
		a.tableName,
		a.vcRecordId,
		a.vcOldValuesJson,
		a.vcNewValuesJson,
		a.vcIpAddress,
		a.vcUserAgent,
		a.btEnabled,
		a.dtCreatedAt
	FROM dbo.tblAuditLog AS a
	LEFT JOIN dbo.tblUser AS u ON u.userId = a.userId
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = a.companyId
	LEFT JOIN dbo.tblStore AS s ON s.storeId = a.storeId;
GO

/* Contexte d'affectation entreprise et boutique des utilisateurs. */
CREATE OR ALTER VIEW dbo.vw_UserAccessContext
AS
	SELECT
		uc.userId,
		uc.userCompanyId AS assignmentId,
		CAST('COMPANY' AS varchar(10)) AS scopeType,
		uc.companyId,
		c.vcCompanyName,
		CAST(NULL AS int) AS storeId,
		CAST(NULL AS varchar(50)) AS vcStoreName,
		uc.roleId,
		r.vcCode AS roleCode,
		r.vcRole AS roleName,
		uc.btEnabled AS assignmentEnabled,
		uc.dtAssignedAt AS assignmentStartedAt,
		uc.dtEndedAt AS assignmentEndedAt
	FROM dbo.tblUserCompany AS uc
	INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
	UNION ALL
	SELECT
		us.userId,
		us.userStoreId AS assignmentId,
		CAST('STORE' AS varchar(10)) AS scopeType,
		st.companyId,
		c.vcCompanyName,
		st.storeId,
		st.vcStoreName,
		us.roleId,
		r.vcCode AS roleCode,
		r.vcRole AS roleName,
		us.btEnabled AS assignmentEnabled,
		us.dtStartDate AS assignmentStartedAt,
		us.dtEndDate AS assignmentEndedAt
	FROM dbo.tblUserStore AS us
	INNER JOIN dbo.tblStore AS st ON st.storeId = us.storeId
	INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = st.companyId;
GO

/* Recherche de produits vendables d'une boutique (équivalent lecture DAL). */
CREATE OR ALTER PROCEDURE dbo.usp_SearchStoreProducts
	@storeId int,
	@search varchar(100) = NULL,
	@limit int = 50
AS
BEGIN
	SET NOCOUNT ON;
	IF @limit < 1 OR @limit > 500 SET @limit = 50;
	DECLARE @pattern varchar(102) = CASE WHEN NULLIF(LTRIM(RTRIM(@search)), '') IS NULL THEN NULL ELSE '%' + @search + '%' END;

	SELECT TOP (@limit)
		storeId, companyId, productId, productCategoryId, vcCategoryName,
		vcProductCode, vcProductName, vcDescription, vcBarcode, vcImageUrl,
		mCurrentSalePrice, alertThreshold, dcAvailableQuantity
	FROM dbo.vw_StoreProductCatalog
	WHERE storeId = @storeId
	  AND (@pattern IS NULL OR vcProductName LIKE @pattern OR vcProductCode LIKE @pattern OR vcBarcode LIKE @pattern)
	ORDER BY vcProductName;
END;
GO

/* Historique des ventes d'une boutique. */
CREATE OR ALTER PROCEDURE dbo.usp_GetSalesByStore
	@storeId int,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	IF @limit < 1 OR @limit > 1000 SET @limit = 100;
	SELECT TOP (@limit) *
	FROM dbo.vw_SaleOverview
	WHERE storeId = @storeId AND btEnabled = 1
	ORDER BY dtSoldAt DESC;
END;
GO

/* Détail et paiements d'une vente retournés en deux jeux de résultats. */
CREATE OR ALTER PROCEDURE dbo.usp_GetSaleDetails
	@saleId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SELECT * FROM dbo.vw_SaleLine WHERE saleId = @saleId ORDER BY productId;
	SELECT * FROM dbo.vw_SalePaymentOverview WHERE saleId = @saleId ORDER BY dtCreatedAt;
END;
GO

/* Recherche de clients par nom, téléphone, courriel ou code. */
CREATE OR ALTER PROCEDURE dbo.usp_SearchCustomers
	@companyId int,
	@search varchar(100),
	@limit int = 50
AS
BEGIN
	SET NOCOUNT ON;
	IF @limit < 1 OR @limit > 500 SET @limit = 50;
	DECLARE @pattern varchar(102) = '%' + LTRIM(RTRIM(@search)) + '%';
	SELECT TOP (@limit)
		c.customerId, c.companyId, c.customerTypeId, t.vcCustomerType,
		c.vcCustomerCode, c.vcLastName, c.vcFirstName, c.vcEmail,
		c.vcPhoneNumber, c.vcQuartier, c.vcCity
	FROM dbo.tblCustomer AS c
	INNER JOIN dbo.tblRefCustomerType AS t ON t.customerTypeId = c.customerTypeId
	WHERE c.companyId = @companyId AND c.btEnabled = 1
	  AND (c.vcLastName LIKE @pattern OR c.vcFirstName LIKE @pattern
		OR c.vcPhoneNumber LIKE @pattern OR c.vcEmail LIKE @pattern OR c.vcCustomerCode LIKE @pattern)
	ORDER BY c.vcLastName, c.vcFirstName;
END;
GO

/* Liste paginée du journal d'audit. */
CREATE OR ALTER PROCEDURE dbo.usp_GetAuditLogs
	@companyId int = NULL,
	@storeId int = NULL,
	@userId int = NULL,
	@tableName sysname = NULL,
	@recordId varchar(100) = NULL,
	@page int = 1,
	@pageSize int = 50
AS
BEGIN
	SET NOCOUNT ON;
	IF @page < 1 SET @page = 1;
	IF @pageSize < 1 OR @pageSize > 500 SET @pageSize = 50;
	SELECT *
	FROM dbo.vw_AuditLogOverview
	WHERE (@companyId IS NULL OR companyId = @companyId)
	  AND (@storeId IS NULL OR storeId = @storeId)
	  AND (@userId IS NULL OR userId = @userId)
	  AND (@tableName IS NULL OR tableName = @tableName)
	  AND (@recordId IS NULL OR vcRecordId = @recordId)
	ORDER BY dtCreatedAt DESC, auditLogId DESC
	OFFSET (@page - 1) * @pageSize ROWS FETCH NEXT @pageSize ROWS ONLY;
END;
GO

/* Notifications valides d'un utilisateur, avec filtre non-lues optionnel. */
CREATE OR ALTER PROCEDURE dbo.usp_GetUserNotifications
	@userId int,
	@limit int = 50,
	@unreadOnly bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	IF @limit < 1 OR @limit > 500 SET @limit = 50;
	SELECT TOP (@limit) *
	FROM dbo.vw_ActiveNotification
	WHERE userId = @userId AND (@unreadOnly = 0 OR btIsRead = 0)
	ORDER BY btIsRead ASC, dtCreatedAt DESC;
END;
GO

/* Marque comme lue une notification appartenant à l'utilisateur. */
CREATE OR ALTER PROCEDURE dbo.usp_MarkNotificationRead
	@notificationId bigint,
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	UPDATE dbo.tblNotification
	SET btIsRead = 1, dtReadAt = SYSUTCDATETIME()
	WHERE notificationId = @notificationId AND userId = @userId AND btIsRead = 0;
	SELECT @@ROWCOUNT AS rowsAffected;
END;
GO

/* Historique des mouvements de stock, filtrable par produit. */
CREATE OR ALTER PROCEDURE dbo.usp_GetStockMovements
	@storeId int,
	@productId bigint = NULL,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	IF @limit < 1 OR @limit > 1000 SET @limit = 100;
	SELECT TOP (@limit) *
	FROM dbo.vw_StockMovementOverview
	WHERE storeId = @storeId AND (@productId IS NULL OR productId = @productId)
	ORDER BY dtMovementAt DESC, stockMovementId DESC;
END;
GO

/* Application atomique d'un delta au stock existant, avec diagnostic d'échec. */
CREATE OR ALTER PROCEDURE dbo.usp_ApplyStoreStockDelta
	@storeId int,
	@productId bigint,
	@delta decimal(18, 3)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	IF @delta = 0 THROW 51000, 'Le delta de stock ne peut pas être nul.', 1;

	DECLARE @changed table (dcStockBefore decimal(18, 3), dcStockAfter decimal(18, 3));
	UPDATE dbo.tblStoreStock WITH (UPDLOCK, ROWLOCK)
	SET dcAvailableQuantity = dcAvailableQuantity + @delta,
		dtUpdatedAt = SYSUTCDATETIME()
	OUTPUT DELETED.dcAvailableQuantity, INSERTED.dcAvailableQuantity INTO @changed
	WHERE storeId = @storeId AND productId = @productId
	  AND (@delta > 0 OR dcAvailableQuantity + @delta >= 0);

	IF EXISTS (SELECT 1 FROM @changed)
	BEGIN
		SELECT dcStockBefore, dcStockAfter FROM @changed;
		RETURN;
	END;
	IF NOT EXISTS (SELECT 1 FROM dbo.tblStoreStock WHERE storeId = @storeId AND productId = @productId)
		THROW 51001, 'Aucune ligne de stock initialisée pour ce produit dans cette boutique.', 1;
	THROW 51002, 'Stock insuffisant pour effectuer cette opération.', 1;
END;
GO

/* Sessions d'une caisse ou d'un utilisateur; limite l'historique retourné. */
CREATE OR ALTER PROCEDURE dbo.usp_GetCashSessionHistory
	@userId int = NULL,
	@storeId int = NULL,
	@limit int = 50
AS
BEGIN
	SET NOCOUNT ON;
	IF @limit < 1 OR @limit > 1000 SET @limit = 50;
	SELECT TOP (@limit) *
	FROM dbo.vw_CashSessionOverview
	WHERE (@userId IS NULL OR userId = @userId)
	  AND (@storeId IS NULL OR storeId = @storeId)
	ORDER BY dtOpenedAt DESC;
END;
GO

/* Dépenses par boutique ou session, avec filtre de statut facultatif. */
CREATE OR ALTER PROCEDURE dbo.usp_GetExpenses
	@storeId int = NULL,
	@cashSessionId int = NULL,
	@statusCode varchar(20) = NULL,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	IF @limit < 1 OR @limit > 1000 SET @limit = 100;
	SELECT TOP (@limit) *
	FROM dbo.vw_ExpenseOverview
	WHERE (@storeId IS NULL OR storeId = @storeId)
	  AND (@cashSessionId IS NULL OR cashSessionId = @cashSessionId)
	  AND (@statusCode IS NULL OR vcStatusCode = @statusCode)
	ORDER BY dtCreatedAt DESC;
END;
GO

/* Bons d'achat d'une boutique, plus détails dans un second jeu de résultats. */
CREATE OR ALTER PROCEDURE dbo.usp_GetPurchasesByStore
	@storeId int,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	IF @limit < 1 OR @limit > 1000 SET @limit = 100;
	SELECT TOP (@limit) *
	FROM dbo.vw_PurchaseOverview
	WHERE storeId = @storeId AND btEnabled = 1
	ORDER BY dtOrderAt DESC;
END;
GO

/* Compte un nombre de lignes de stock en dessous du seuil configuré. */
CREATE OR ALTER PROCEDURE dbo.usp_GetLowStock
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SELECT storeId, companyId, productId, vcProductCode, vcProductName,
		   dcAvailableQuantity, alertThreshold
	FROM dbo.vw_StoreStockStatus
	WHERE storeId = @storeId AND isLowStock = 1
	ORDER BY dcAvailableQuantity, vcProductName;
END;
GO

/* Clients actifs enrichis des références de type et de genre. */
CREATE OR ALTER VIEW dbo.vw_CustomerDetails
AS
	SELECT
		c.customerId,
		c.companyId,
		c.customerTypeId,
		ct.vcCode AS customerTypeCode,
		ct.vcCustomerType,
		c.genderId,
		g.vcCode AS genderCode,
		c.vcCustomerCode,
		c.vcLastName,
		c.vcFirstName,
		c.vcEmail,
		c.vcPhoneNumber,
		c.vcQuartier,
		c.vcCity,
		c.createdByUserId,
		c.btEnabled,
		c.dtCreatedAt,
		c.dtLastUpdated,
		CONCAT(
			COALESCE(c.vcLastName, ''), ' ',
			COALESCE(c.vcFirstName, ''), ' ',
			COALESCE(c.vcCustomerCode, ''), ' ',
			COALESCE(c.vcPhoneNumber, ''), ' ',
			COALESCE(c.vcEmail, '')
		) AS fullSearchText
	FROM dbo.tblCustomer AS c
	INNER JOIN dbo.tblRefCustomerType AS ct ON ct.customerTypeId = c.customerTypeId
	LEFT JOIN dbo.tblRefGender AS g ON g.genderId = c.genderId
	WHERE c.btEnabled = 1;
GO

/* Liste des clients actifs d'une entreprise. */
CREATE OR ALTER PROCEDURE dbo.sp_GetCustomersByCompany
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit être positif.', 1;

		SELECT *
		FROM dbo.vw_CustomerDetails
		WHERE companyId = @companyId
		ORDER BY vcLastName, vcFirstName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Crée un client après validation des références. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateCustomer
	@companyId int,
	@customerTypeCode varchar(50),
	@vcCustomerCode varchar(20),
	@createdByUserId int,
	@genderCode varchar(50) = NULL,
	@vcLastName varchar(50) = NULL,
	@vcFirstName varchar(50) = NULL,
	@vcEmail varchar(100) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcQuartier varchar(50) = NULL,
	@vcCity varchar(50) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		DECLARE @customerTypeId int;
		DECLARE @genderId int = NULL;

		IF @companyId IS NULL OR @companyId <= 0
			THROW 51101, 'companyId est obligatoire et doit être positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcCustomerCode)), '') IS NULL
			THROW 51102, 'vcCustomerCode est obligatoire.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 51103, 'createdByUserId est obligatoire.', 1;

		SELECT @customerTypeId = customerTypeId
		FROM dbo.tblRefCustomerType
		WHERE vcCode = @customerTypeCode;
		IF @customerTypeId IS NULL
			THROW 51104, 'Type de client inconnu.', 1;

		IF @genderCode IS NOT NULL
		BEGIN
			SELECT @genderId = genderId
			FROM dbo.tblRefGender
			WHERE vcCode = @genderCode;
			IF @genderId IS NULL
				THROW 51105, 'Genre inconnu.', 1;
		END;

		INSERT INTO dbo.tblCustomer (
			companyId, customerTypeId, genderId, vcCustomerCode,
			vcLastName, vcFirstName, vcEmail, vcPhoneNumber,
			vcQuartier, vcCity, createdByUserId, btEnabled,
			dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.*
		VALUES (
			@companyId, @customerTypeId, @genderId, LTRIM(RTRIM(@vcCustomerCode)),
			@vcLastName, @vcFirstName, @vcEmail, @vcPhoneNumber,
			@vcQuartier, @vcCity, @createdByUserId, 1,
			SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Récupère un client uniquement dans le tenant demandé. */
CREATE OR ALTER PROCEDURE dbo.sp_GetCustomerById
	@customerId int,
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @customerId IS NULL OR @customerId <= 0
			THROW 51106, 'customerId est obligatoire et doit être positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit être positif.', 1;

		SELECT
			c.customerId, c.companyId, c.customerTypeId,
			ct.vcCode AS customerTypeCode, ct.vcCustomerType,
			c.genderId, g.vcCode AS genderCode,
			c.vcCustomerCode, c.vcLastName, c.vcFirstName,
			c.vcEmail, c.vcPhoneNumber, c.vcQuartier, c.vcCity,
			c.createdByUserId, c.btEnabled, c.dtCreatedAt, c.dtLastUpdated
		FROM dbo.tblCustomer AS c
		INNER JOIN dbo.tblRefCustomerType AS ct ON ct.customerTypeId = c.customerTypeId
		LEFT JOIN dbo.tblRefGender AS g ON g.genderId = c.genderId
		WHERE c.customerId = @customerId AND c.companyId = @companyId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Recherche caisse, y compris les formes « Prénom Nom » et « Nom Prénom ». */
CREATE OR ALTER PROCEDURE dbo.sp_SearchCustomers
	@companyId int,
	@q varchar(100),
	@limit int = 50
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit être positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@q)), '') IS NULL
			THROW 51107, 'Le terme de recherche q est obligatoire.', 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 500 SET @limit = 50;

		DECLARE @pattern varchar(202) = '%' + LTRIM(RTRIM(@q)) + '%';
		SELECT TOP (@limit)
			customerId, companyId, customerTypeId, customerTypeCode, vcCustomerType,
			genderId, genderCode, vcCustomerCode, vcLastName,
			vcFirstName, vcEmail, vcPhoneNumber, vcQuartier, vcCity,
			createdByUserId, btEnabled, dtCreatedAt, dtLastUpdated, fullSearchText
		FROM dbo.vw_CustomerDetails
		WHERE companyId = @companyId
		  AND (
			fullSearchText LIKE @pattern
			OR LTRIM(RTRIM(CONCAT(COALESCE(vcFirstName, ''), ' ', COALESCE(vcLastName, '')))) LIKE @pattern
			OR LTRIM(RTRIM(CONCAT(COALESCE(vcLastName, ''), ' ', COALESCE(vcFirstName, '')))) LIKE @pattern
		  )
		ORDER BY vcLastName, vcFirstName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Mise à jour PATCH. Les indicateurs distinguent propriété absente et NULL explicite. */
CREATE OR ALTER PROCEDURE dbo.sp_UpdateCustomer
	@customerId int,
	@companyId int,
	@vcLastName varchar(50) = NULL,
	@setVcLastName bit = 0,
	@vcFirstName varchar(50) = NULL,
	@setVcFirstName bit = 0,
	@vcEmail varchar(100) = NULL,
	@setVcEmail bit = 0,
	@vcPhoneNumber varchar(20) = NULL,
	@setVcPhoneNumber bit = 0,
	@vcQuartier varchar(50) = NULL,
	@setVcQuartier bit = 0,
	@vcCity varchar(50) = NULL,
	@setVcCity bit = 0,
	@customerTypeCode varchar(50) = NULL,
	@setCustomerType bit = 0,
	@genderCode varchar(50) = NULL,
	@setGender bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		DECLARE @customerTypeId int = NULL;
		DECLARE @genderId int = NULL;

		IF @customerId IS NULL OR @customerId <= 0
			THROW 51106, 'customerId est obligatoire et doit être positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit être positif.', 1;

		IF @setCustomerType = 1
		BEGIN
			IF NULLIF(LTRIM(RTRIM(@customerTypeCode)), '') IS NULL
				THROW 51108, 'Le type de client ne peut pas être NULL ou vide.', 1;
			SELECT @customerTypeId = customerTypeId
			FROM dbo.tblRefCustomerType
			WHERE vcCode = @customerTypeCode;
			IF @customerTypeId IS NULL
				THROW 51104, 'Type de client inconnu.', 1;
		END;

		IF @setGender = 1 AND @genderCode IS NOT NULL
		BEGIN
			SELECT @genderId = genderId
			FROM dbo.tblRefGender
			WHERE vcCode = @genderCode;
			IF @genderId IS NULL
				THROW 51105, 'Genre inconnu.', 1;
		END;

		UPDATE dbo.tblCustomer
		SET vcLastName = CASE WHEN @setVcLastName = 1 THEN @vcLastName ELSE vcLastName END,
			vcFirstName = CASE WHEN @setVcFirstName = 1 THEN @vcFirstName ELSE vcFirstName END,
			vcEmail = CASE WHEN @setVcEmail = 1 THEN @vcEmail ELSE vcEmail END,
			vcPhoneNumber = CASE WHEN @setVcPhoneNumber = 1 THEN @vcPhoneNumber ELSE vcPhoneNumber END,
			vcQuartier = CASE WHEN @setVcQuartier = 1 THEN @vcQuartier ELSE vcQuartier END,
			vcCity = CASE WHEN @setVcCity = 1 THEN @vcCity ELSE vcCity END,
			customerTypeId = CASE WHEN @setCustomerType = 1 THEN @customerTypeId ELSE customerTypeId END,
			genderId = CASE WHEN @setGender = 1 THEN @genderId ELSE genderId END,
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.*
		WHERE customerId = @customerId AND companyId = @companyId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Désactivation logique limitée au tenant. */
CREATE OR ALTER PROCEDURE dbo.sp_SoftDeleteCustomer
	@customerId int,
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @customerId IS NULL OR @customerId <= 0
			THROW 51106, 'customerId est obligatoire et doit être positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit être positif.', 1;

		UPDATE dbo.tblCustomer
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE customerId = @customerId AND companyId = @companyId AND btEnabled = 1;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
