USE [GestionsBoutiques]
GO
/****** Objet : View [dbo].[vw_CashSessionReportTotals] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   VIEW [dbo].[vw_CashSessionReportTotals]
AS
    WITH PaidBySale AS (
        SELECT sp.saleId, 
            SUM(CASE WHEN pm.vcCode = 'CASH' THEN sp.mAmount ELSE 0 END) AS cashPaid, 
            SUM(CASE WHEN pm.vcCode IN ('ORANGE_MONEY','MTN_MOMO') THEN sp.mAmount ELSE 0 END) AS mobilePaid
        FROM dbo.tblSalePayment AS sp
        INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = sp.paymentMethodId
        INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = sp.paymentStatusId
        WHERE ps.vcCode = 'SUCCESS'
        GROUP BY sp.saleId
    ), SalesBySession AS (
        SELECT s.cashSessionId, 
            SUM(s.mNetAmount) AS mTotalSales, 
            SUM(COALESCE(p.cashPaid,0)) AS mTotalCash, 
            SUM(COALESCE(p.mobilePaid,0)) AS mTotalMobileMoney, 
            SUM(s.mDebtAmount) AS mTotalCredit
        FROM dbo.tblSale AS s
        LEFT JOIN PaidBySale AS p ON p.saleId = s.saleId
        WHERE s.IsCancelled = 0
        GROUP BY s.cashSessionId
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
    ), 
    CashierReports AS (
        SELECT 
            cr.managerSessionId AS managerSessionId, 
            SUM(cr.mClosingAmount) AS mTotalCashierReports
        FROM dbo.tblCashReport cr
        INNER JOIN dbo.tblRefCashReportStatus rs ON rs.cashReportStatusId = cr.cashReportStatusId
        WHERE rs.vcCode IN ('APPROVED', 'PENDING_ADMIN')
          AND cr.managerSessionId IS NOT NULL 
        GROUP BY cr.managerSessionId
    )
    SELECT
        cs.cashSessionId, cs.mOpeningCaisse, 
        COALESCE(s.mTotalSales,0) AS mTotalSales, 
        COALESCE(s.mTotalCash,0) AS mTotalCash, 
        COALESCE(s.mTotalMobileMoney,0) AS mTotalMobileMoney, 
        COALESCE(s.mTotalCredit,0) AS mTotalCredit, 
        COALESCE(r.mTotalRecoveries,0) AS mTotalRecoveries, 
        COALESCE(e.mTotalApprovedExpenses,0) AS mTotalApprovedExpenses, 
        COALESCE(cr.mTotalCashierReports,0) AS mTotalCashierReports,
        (cs.mOpeningCaisse + COALESCE(s.mTotalCash,0) + COALESCE(r.mTotalRecoveries,0) + COALESCE(cr.mTotalCashierReports,0) - COALESCE(e.mTotalApprovedExpenses,0)) AS mTheoreticalBalance
    FROM dbo.tblCashSession AS cs
    LEFT JOIN SalesBySession AS s ON s.cashSessionId = cs.cashSessionId
    LEFT JOIN RecoveriesBySession AS r ON r.cashSessionId = cs.cashSessionId
    LEFT JOIN ApprovedExpensesBySession AS e ON e.cashSessionId = cs.cashSessionId
    LEFT JOIN CashierReports AS cr ON cr.managerSessionId = cs.cashSessionId;
GO
/****** Objet : View [dbo].[vw_CashReportDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   VIEW [dbo].[vw_CashReportDetails]
AS
	SELECT
		cr.cashReportId,
		cr.cashSessionId,
		cr.cashReportStatusId,
		rs.vcCode AS statusCode,
		rs.vcCashReportStatus,
		cs.userId AS sessionUserId,
		cs.mOpeningCaisse,
		r.storeId,
		r.vcRegisterCode,
		r.vcRegisterName,
		cr.mOpeningCashReport,
		cr.mTotalSales,
		cr.mTotalCash,
		cr.mTotalMobileMoney,
		cr.mTotalCredit,
		cr.mTotalRecoveries,
		cr.mTotalApprovedExpenses,
		
		COALESCE(totals.mTotalCashierReports, 0) AS mTotalCashierReports,
		COALESCE(totals.mTheoreticalBalance, cr.mTheoreticalBalance) AS mTheoreticalBalance,
		cr.mClosingAmount,
		cr.mClosingAmount - COALESCE(totals.mTheoreticalBalance, cr.mTheoreticalBalance) AS mDifferenceAmount,
		cr.vcManagerComment,
		cr.vcAdminComment,
		cr.dtCreatedAt,
		
		cs.userId AS userId,
		
		-- ✅ CORRECTION ICI : On utilise un JOIN direct pour le nom
		LTRIM(RTRIM(ISNULL(u.vcFirstName, '') + ' ' + ISNULL(u.vcLastName, ''))) AS userName,
		u.vcLastName,
		u.vcFirstName,

		(
			SELECT TOP 1 rf.vcCode 
			FROM dbo.tblUserStore us_role 
			INNER JOIN dbo.tblRefRole rf ON rf.roleId = us_role.roleId
			WHERE us_role.userId = cs.userId
		) AS creatorRoleCode,

		(
			SELECT TOP 1 us_creator.assignedByUserId 
			FROM dbo.tblUserStore us_creator 
			WHERE us_creator.userId = cs.userId
		) AS assignedByUserId,

		s.vcStoreName AS storeName,
		s.companyId,
		c.vcCompanyName AS companyName
	FROM dbo.tblCashReport AS cr
	INNER JOIN dbo.tblRefCashReportStatus AS rs ON rs.cashReportStatusId = cr.cashReportStatusId
	INNER JOIN dbo.tblCashSession AS cs ON cs.cashSessionId = cr.cashSessionId
	INNER JOIN dbo.tblCashRegister AS r ON r.cashRegisterId = cs.cashRegisterId
	INNER JOIN dbo.tblStore AS s ON s.storeId = r.storeId
	INNER JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
	-- ✅ Jointure directe sur tblUser
	LEFT JOIN dbo.tblUser AS u ON u.userId = cs.userId
	LEFT JOIN dbo.vw_CashSessionReportTotals AS totals ON totals.cashSessionId = cr.cashSessionId;
GO
/****** Objet : View [dbo].[vw_AuditLogDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Journal d'audit avec nom de l'utilisateur, entreprise et boutique. */
CREATE   VIEW [dbo].[vw_AuditLogDetails]
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
a.dtCreatedAt,
a.dtLastUpdated
FROM dbo.tblAuditLog AS a
LEFT JOIN dbo.tblUser AS u ON u.userId = a.userId
LEFT JOIN dbo.tblCompany AS c ON c.companyId = a.companyId
LEFT JOIN dbo.tblStore AS s ON s.storeId = a.storeId;

GO
/****** Objet : View [dbo].[vw_CashRegisterDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Caisses avec boutique et entreprise. */
CREATE   VIEW [dbo].[vw_CashRegisterDetails]
AS
	SELECT
		r.cashRegisterId,
		r.storeId,
		s.companyId,
		s.vcStoreName,
		r.vcRegisterCode,
		r.vcRegisterName,
		r.btEnabled
	FROM dbo.tblCashRegister AS r
	INNER JOIN dbo.tblStore AS s ON s.storeId = r.storeId;
GO
/****** Objet : View [dbo].[vw_CashSessionDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Sessions enrichies du statut, de la caisse et de l'operateur. */
CREATE   VIEW [dbo].[vw_CashSessionDetails]
AS
	SELECT
		cs.cashSessionId,
		cs.cashRegisterId,
		r.storeId,
		s.companyId,
		r.vcRegisterCode,
		r.vcRegisterName,
		cs.userId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS userName,
		cs.cashSessionStatusId,
		st.vcCode AS statusCode,
		st.vcCashSessionStatus,
		cs.mOpeningCaisse,
		cs.dtOpenedAt,
		cs.dtClosedAt,
		cs.mDeclaredClosingAmount,
		cs.IsReportGenerated
	FROM dbo.tblCashSession AS cs
	INNER JOIN dbo.tblRefCashSessionStatus AS st ON st.cashSessionStatusId = cs.cashSessionStatusId
	INNER JOIN dbo.tblCashRegister AS r ON r.cashRegisterId = cs.cashRegisterId
	INNER JOIN dbo.tblStore AS s ON s.storeId = r.storeId
	INNER JOIN dbo.tblUser AS u ON u.userId = cs.userId;
GO
/****** Objet : View [dbo].[vw_CompanyDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Informations entreprise sans filtrage, pour les lectures par ID. */
CREATE   VIEW [dbo].[vw_CompanyDetails]
AS
	SELECT
		companyId,
		vcCompanyCode,
		vcCompanyName,
		vcRccm,
		vcPhoneNumber,
		vcEmail,
		vcAddress,
		vcCity,
		vcLogoUrl,
		btEnabled,
		dtCreatedAt,
		dtLastUpdated
	FROM dbo.tblCompany;
GO
/****** Objet : View [dbo].[vw_CustomerDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   VIEW [dbo].[vw_CustomerDetails]
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
/****** Objet : View [dbo].[vw_DebtPaymentDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Historique des paiements avec methode, statut et nom de l'operateur. */
CREATE   VIEW [dbo].[vw_DebtPaymentDetails]
AS
	SELECT
		dp.*,
		pm.vcCode AS methodCode,
		pm.vcPaymentMethod,
		ps.vcCode AS statusCode,
		ps.vcPaymentStatus,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS operatedByName
	FROM dbo.tblDebtPayment AS dp
	INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = dp.paymentMethodId
	INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = dp.paymentStatusId
	INNER JOIN dbo.tblUser AS u ON u.userId = dp.OperatedByUserId;
GO
/****** Objet : View [dbo].[vw_ExpenseCategoryDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   VIEW [dbo].[vw_ExpenseCategoryDetails]
AS
	SELECT expenseCategoryId, companyId, vcExpenseCategoryCode,
		vcExpenseCategory, btEnabled
	FROM dbo.tblExpenseCategory;
GO
/****** Objet : View [dbo].[vw_ExpenseDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Depenses enrichies de la categorie et des noms de createur/approbateur. */
CREATE   VIEW [dbo].[vw_ExpenseDetails]
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
		LTRIM(RTRIM(COALESCE(createdBy.vcLastName, '') + ' ' + COALESCE(createdBy.vcFirstName, ''))) AS createdByName,
		e.approvedByUserId,
		LTRIM(RTRIM(COALESCE(approvedBy.vcLastName, '') + ' ' + COALESCE(approvedBy.vcFirstName, ''))) AS approvedByName,
		e.dtApprovedAt,
		e.dtCreatedAt
	FROM dbo.tblExpense AS e
	INNER JOIN dbo.tblExpenseCategory AS ec ON ec.expenseCategoryId = e.expenseCategoryId
	INNER JOIN dbo.tblStore AS s ON s.storeId = e.storeId
	INNER JOIN dbo.tblUser AS createdBy ON createdBy.userId = e.createdByUserId
	LEFT JOIN dbo.tblUser AS approvedBy ON approvedBy.userId = e.approvedByUserId;
GO
/****** Objet : View [dbo].[vw_InventoryDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Entete d'inventaire enrichie du statut et de la boutique. */
CREATE   VIEW [dbo].[vw_InventoryDetails]
AS
	SELECT
		i.inventoryId,
		i.vcInventoryNumber,
		i.storeId,
		s.companyId,
		s.vcStoreName,
		i.inventoryStatusId,
		rs.vcCode AS statusCode,
		rs.vcInventoryStatus,
		i.dtStartedAt,
		i.dtEndedAt,
		i.createdByUserId,
		i.approvedByUserId
	FROM dbo.tblInventory AS i
	INNER JOIN dbo.tblRefInventoryStatus AS rs ON rs.inventoryStatusId = i.inventoryStatusId
	INNER JOIN dbo.tblStore AS s ON s.storeId = i.storeId;
GO
/****** Objet : View [dbo].[vw_InventoryLineDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Details avec difference calculee par la table et informations produit. */
CREATE   VIEW [dbo].[vw_InventoryLineDetails]
AS
	SELECT
		d.inventoryDetailId,
		d.inventoryId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.dcTheoreticalQuantity,
		d.dcPhysicalQuantity,
		d.DifferenceQuantity,
		d.vcComment
	FROM dbo.tblInventoryDetail AS d
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO
/****** Objet : View [dbo].[vw_NotificationDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Notifications avec les informations de leur type. */
CREATE   VIEW [dbo].[vw_NotificationDetails]
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
		n.dtExpiresAt,
		n.btEnabled,
		n.dtCreatedAt
	FROM dbo.tblNotification AS n
	LEFT JOIN dbo.tblRefNotificationType AS t
		ON t.notificationTypeId = n.notificationTypeId;
GO
/****** Objet : View [dbo].[vw_PromotionDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Promotions enrichies du type de remise. */
CREATE   VIEW [dbo].[vw_PromotionDetails]
AS
	SELECT
		pr.promotionId,
		pr.companyId,
		pr.vcPromotionName,
		pr.discountTypeId,
		dt.vcCode AS discountTypeCode,
		dt.vcDiscountType,
		pr.dcDiscountValue,
		pr.dtStartDate,
		pr.dtEndDate,
		pr.createdByUserId,
		pr.btEnabled,
		pr.dtCreatedAt,
		pr.dtLastUpdated
	FROM dbo.tblPromotion AS pr
	INNER JOIN dbo.tblRefDiscountType AS dt ON dt.discountTypeId = pr.discountTypeId;
GO
/****** Objet : View [dbo].[vw_PromotionProductDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   VIEW [dbo].[vw_PromotionProductDetails]
AS
	SELECT
		pp.promotionId,
		p.productId,
		p.vcProductCode,
		p.vcProductName
	FROM dbo.tblPromotionProduct AS pp
	INNER JOIN dbo.tblProduct AS p ON p.productId = pp.productId;
GO
/****** Objet : View [dbo].[vw_PromotionStoreDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Liens promotion-boutique et promotion-produit. */
CREATE   VIEW [dbo].[vw_PromotionStoreDetails]
AS
	SELECT
		ps.promotionId,
		ps.storeId,
		s.companyId,
		s.vcStoreCode,
		s.vcStoreName
	FROM dbo.tblPromotionStore AS ps
	INNER JOIN dbo.tblStore AS s ON s.storeId = ps.storeId;
GO
/****** Objet : View [dbo].[vw_PurchaseDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Entetes d'achat enrichies du fournisseur, de la boutique et du statut. */
CREATE   VIEW [dbo].[vw_PurchaseDetails]
AS
	SELECT
		p.purchaseId,
		p.vcPurchaseNumber,
		p.supplierId,
		s.vcBusinessName AS supplierName,
		p.storeId,
		st.companyId,
		st.vcStoreName,
		p.purchaseStatusId,
		rs.vcCode AS statusCode,
		rs.vcPurchaseStatus,
		p.dtOrderAt,
		p.dtReceivedAt,
		p.mTotalAmount,
		p.createdByUserId,
		p.receivedByUserId,
		p.btEnabled,
		p.dtCreatedAt,
		p.dtLastUpdated
	FROM dbo.tblPurchase AS p
	INNER JOIN dbo.tblSupplier AS s ON s.supplierId = p.supplierId
	INNER JOIN dbo.tblStore AS st ON st.storeId = p.storeId
	INNER JOIN dbo.tblRefPurchaseStatus AS rs ON rs.purchaseStatusId = p.purchaseStatusId;
GO
/****** Objet : View [dbo].[vw_PurchaseLineDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Lignes d'achat avec l'identite du produit. */
CREATE   VIEW [dbo].[vw_PurchaseLineDetails]
AS
	SELECT
		d.purchaseDetailId,
		d.purchaseId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.dcOrderedQuantity,
		d.dcReceivedQuantity,
		d.mUnitPurchasePrice,
		d.LineAmount,
		d.vcLotNumber,
		d.dtExpirationAt
	FROM dbo.tblPurchaseDetail AS d
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO
/****** Objet : View [dbo].[vw_ReferenceTableCatalog] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Liste blanche des references et indicateur de presence de btEnabled. */
CREATE   VIEW [dbo].[vw_ReferenceTableCatalog]
AS
	SELECT
		v.refKey,
		v.tableName,
		CONVERT(bit, CASE WHEN c.COLUMN_NAME IS NULL THEN 0 ELSE 1 END) AS hasEnabledColumn
	FROM (VALUES
		('role', 'tblRefRole'),
		('gender', 'tblRefGender'),
		('customerType', 'tblRefCustomerType'),
		('storeType', 'tblRefStoreType'),
		('paymentMethod', 'tblRefPaymentMethod'),
		('paymentStatus', 'tblRefPaymentStatus'),
		('saleStatus', 'tblRefSaleStatus'),
		('discountType', 'tblRefDiscountType'),
		('cashSessionStatus', 'tblRefCashSessionStatus'),
		('stockMovementType', 'tblRefStockMovementType'),
		('transferStatus', 'tblRefTransferStatus'),
		('thirdPartyMovementType', 'tblRefThirdPartyMovementType'),
		('adjustmentReason', 'tblRefAdjustmentReason'),
		('adjustmentStatus', 'tblRefAdjustmentStatus'),
		('cashReportStatus', 'tblRefCashReportStatus'),
		('purchaseStatus', 'tblRefPurchaseStatus'),
		('inventoryStatus', 'tblRefInventoryStatus'),
		('registrationRequestStatus', 'tblRefRegistrationRequestStatus'),
		('unitOfMeasure', 'tblRefUnitOfMeasure'),
		('treasuryAccountType', 'tblRefTreasuryAccountType'),
		('treasuryMovementType', 'tblRefTreasuryMovementType'),
		('notificationType', 'tblRefNotificationType')
	) AS v(refKey, tableName)
	LEFT JOIN INFORMATION_SCHEMA.COLUMNS AS c
		ON c.TABLE_SCHEMA = 'dbo'
	   AND c.TABLE_NAME = v.tableName
	   AND c.COLUMN_NAME = 'btEnabled';
GO
/****** Objet : View [dbo].[vw_SaleDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* En-tete de vente, correspondant aux colonnes retournees par SaleDAL. */
CREATE   VIEW [dbo].[vw_SaleDetails]
AS
	SELECT
		s.saleId,
		s.vcSaleNumber,
		s.companyId,
		s.storeId,
		s.cashSessionId,
		s.customerId,
		CASE WHEN c.customerId IS NULL THEN NULL
			ELSE LTRIM(RTRIM(COALESCE(c.vcLastName, '') + ' ' + COALESCE(c.vcFirstName, ''))) END AS customerName,
		s.sellerUserId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS sellerName,
		s.saleStatusId,
		rs.vcCode AS statusCode,
		rs.vcSaleStatus,
		s.mGrossAmount,
		s.mDiscountAmount,
		s.mNetAmount,
		s.mPaidAmount,
		s.mDebtAmount,
		s.dtSoldAt,
		s.IsCancelled,
		s.dtCancelledAt,
		s.vcCancellationReason,
		s.btEnabled,
		s.dtCreatedAt,
		s.dtLastUpdated
	FROM dbo.tblSale AS s
	INNER JOIN dbo.tblRefSaleStatus AS rs ON rs.saleStatusId = s.saleStatusId
	INNER JOIN dbo.tblUser AS u ON u.userId = s.sellerUserId
	LEFT JOIN dbo.tblCustomer AS c ON c.customerId = s.customerId;
GO
/****** Objet : View [dbo].[vw_SaleLineDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   VIEW [dbo].[vw_SaleLineDetails]
AS
	SELECT
		d.saleDetailId,
		d.saleId,
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
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO
/****** Objet : View [dbo].[vw_SalePaymentDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   VIEW [dbo].[vw_SalePaymentDetails]
AS
	SELECT
		sp.salePaymentId,
		sp.saleId,
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
		sp.vcCallbackPayload,
		sp.OperatorMessage,
		sp.dtCreatedAt,
		sp.dtLastUpdated
	FROM dbo.tblSalePayment AS sp
	INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = sp.paymentMethodId
	INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = sp.paymentStatusId;
GO
/****** Objet : View [dbo].[vw_StockAdjustmentDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Ajustements enrichis du motif, statut et boutique. */
CREATE   VIEW [dbo].[vw_StockAdjustmentDetails]
AS
	SELECT
		a.stockAdjustmentId,
		a.storeId,
		st.companyId,
		st.vcStoreName,
		a.adjustmentReasonId,
		r.vcCode AS reasonCode,
		r.vcAdjustmentReason,
		a.adjustmentStatusId,
		s.vcCode AS statusCode,
		s.vcAdjustmentStatus,
		a.vcJustification,
		a.vcProofImageUrl,
		a.createdByUserId,
		a.approvedByUserId,
		a.dtcreatedAt,
		a.dtApprovedAt,
		a.vcApprovalComment
	FROM dbo.tblStockAdjustment AS a
	INNER JOIN dbo.tblRefAdjustmentReason AS r ON r.adjustmentReasonId = a.adjustmentReasonId
	INNER JOIN dbo.tblRefAdjustmentStatus AS s ON s.adjustmentStatusId = a.adjustmentStatusId
	INNER JOIN dbo.tblStore AS st ON st.storeId = a.storeId;
GO
/****** Objet : View [dbo].[vw_StockAdjustmentLineDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Lignes d'ajustement avec informations produit. */
CREATE   VIEW [dbo].[vw_StockAdjustmentLineDetails]
AS
	SELECT
		d.stockAdjustmentDetailId,
		d.stockAdjustmentId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.stockLotId,
		d.dcQuantityBefore,
		d.dcAdjustmentQuantity,
		d.dcQuantityAfter
	FROM dbo.tblStockAdjustmentDetail AS d
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO
/****** Objet : View [dbo].[vw_StockMovementDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Vue d'historique avec les alias attendus par StockMovementDAL.getByStore. */
CREATE   VIEW [dbo].[vw_StockMovementDetails]
AS
	SELECT
		m.stockMovementId,
		m.storeId,
		m.productId,
		p.vcProductName,
		m.stockLotId,
		m.stockMovementTypeId,
		t.vcCode,
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
	INNER JOIN dbo.tblProduct AS p ON p.productId = m.productId
	INNER JOIN dbo.tblRefStockMovementType AS t
		ON t.stockMovementTypeId = m.stockMovementTypeId
	INNER JOIN dbo.tblUser AS u ON u.userId = m.operatedByUserId;
GO
/****** Objet : View [dbo].[vw_StockTransferDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE VIEW [dbo].[vw_StockTransferDetails] AS
SELECT
    t.stockTransferId,
    t.vcTransferNumber,
    t.sourceStoreId,
    s.vcStoreCode AS sourceStoreCode,
    s.vcStoreName AS sourceStoreName,
    t.destinationStoreId,
    d.vcStoreCode AS destinationStoreCode,
    d.vcStoreName AS destinationStoreName,
    t.transferStatusId,
    st.vcCode AS statusCode,
    st.vcTransferStatus,
    t.createdByUserId,
    u.vcLastName AS createdByLastName,
    u.vcFirstName AS createdByFirstName,
    t.vcCarrierName,
    t.dtCreatedAt,
    t.dtShippedAt,
    t.dtReceivedAt,
    t.IsCancelled,
    t.vcCancellationReason
FROM dbo.tblStockTransfer t
INNER JOIN dbo.tblStore s ON t.sourceStoreId = s.storeId
INNER JOIN dbo.tblStore d ON t.destinationStoreId = d.storeId
INNER JOIN dbo.tblRefTransferStatus st ON t.transferStatusId = st.transferStatusId
INNER JOIN dbo.tblUser u ON t.createdByUserId = u.userId;
GO
/****** Objet : View [dbo].[vw_StockTransferLineDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE VIEW [dbo].[vw_StockTransferLineDetails] AS
SELECT
    d.stockTransferDetailId,
    d.stockTransferId,
    d.productId,
    p.vcProductName,
    p.vcProductCode,
    d.stockLotId,
    d.dcRequestedQuantity,
    d.dcShippedQuantity,
    d.dcReceivedQuantity,
    (d.dcRequestedQuantity - ISNULL(d.dcShippedQuantity, 0)) AS dcPendingQuantity
FROM dbo.tblStockTransferDetail d
INNER JOIN dbo.tblProduct p ON d.productId = p.productId;
GO
/****** Objet : View [dbo].[vw_StoreDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Boutiques enrichies du type, du code et du nom de l'entreprise. */
CREATE   VIEW [dbo].[vw_StoreDetails]
AS
	SELECT
		s.storeId,
		s.companyId,
		c.vcCompanyCode,
		c.vcCompanyName,
		s.storeTypeId,
		t.vcCode AS storeTypeCode,
		t.vcStoreType,
		s.vcStoreCode,
		s.vcStoreName,
		s.vcAddress,
		s.vcCity,
		s.vcPhoneNumber,
		s.dcLatitude,
		s.dcLongitude,
		s.createdByUserId,
		s.btEnabled,
		s.dtCreatedAt,
		s.dtLastUpdated
	FROM dbo.tblStore AS s
	INNER JOIN dbo.tblRefStoreType AS t ON t.storeTypeId = s.storeTypeId
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId;
GO
/****** Objet : View [dbo].[vw_StoreStockDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Stock par boutique avec informations produit, seuil et statut de stock bas. */
CREATE   VIEW [dbo].[vw_StoreStockDetails]
AS
	SELECT
		k.storeStockId,
		k.storeId,
		s.companyId,
		k.productId,
		p.vcProductCode,
		p.vcProductName,
		p.btEnabled AS productEnabled,
		k.dcAvailableQuantity,
		k.dcReservedQuantity,
		COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold, 0) AS threshold,
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
/****** Objet : View [dbo].[vw_SupplierDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Fournisseurs avec le nom d'affichage et les informations de l'entreprise. */
CREATE   VIEW [dbo].[vw_SupplierDetails]
AS
	SELECT
		s.supplierId,
		s.companyId,
		c.vcCompanyCode,
		c.vcCompanyName,
		s.vcSupplierCode,
		s.vcBusinessName,
		s.vcLastName,
		s.vcFirstName,
		COALESCE(s.vcBusinessName, s.vcLastName, s.vcFirstName) AS supplierDisplayName,
		s.vcPhoneNumber,
		s.vcEmail,
		s.vcAddress,
		s.vcCity,
		s.createdByUserId,
		s.btEnabled,
		s.dtCreatedAt,
		s.dtLastUpdated
	FROM dbo.tblSupplier AS s
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId;
GO
/****** Objet : View [dbo].[vw_SupplierProductDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Association fournisseur-produit avec l'identite complete du produit. */
CREATE   VIEW [dbo].[vw_SupplierProductDetails]
AS
	SELECT
		sp.supplierProductId,
		sp.supplierId,
		s.companyId,
		sp.productId,
		p.vcProductCode,
		p.vcProductName,
		sp.vcSupplierReference,
		sp.mReferencePurchasePrice,
		sp.deliveryLeadTimeDays,
		sp.IsPreferred,
		sp.btEnabled
	FROM dbo.tblSupplierProduct AS sp
	INNER JOIN dbo.tblSupplier AS s ON s.supplierId = sp.supplierId
	INNER JOIN dbo.tblProduct AS p ON p.productId = sp.productId;
GO
/****** Objet : View [dbo].[vw_ThirdPartyAccountDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Comptes tiers avec les informations d'identite du client ou fournisseur. */
CREATE   VIEW [dbo].[vw_ThirdPartyAccountDetails]
AS
	SELECT
		a.thirdPartyAccountId,
		a.companyId,
		a.customerId,
		c.vcCustomerCode,
		c.vcLastName AS customerLastName,
		c.vcFirstName AS customerFirstName,
		a.supplierId,
		s.vcSupplierCode,
		s.vcBusinessName AS supplierBusinessName,
		s.vcLastName AS supplierLastName,
		s.vcFirstName AS supplierFirstName,
		a.dcCurrentBalance,
		a.dtLastMovementAt,
		a.btEnabled,
		a.dtCreatedAt,
		a.dtLastUpdated
	FROM dbo.tblThirdPartyAccount AS a
	LEFT JOIN dbo.tblCustomer AS c ON c.customerId = a.customerId
	LEFT JOIN dbo.tblSupplier AS s ON s.supplierId = a.supplierId;
GO
/****** Objet : View [dbo].[vw_ThirdPartyAccountMovementDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Vue de mouvements enrichie du type et de l'operateur. */
CREATE   VIEW [dbo].[vw_ThirdPartyAccountMovementDetails]
AS
	SELECT
		m.thirdPartyAccountMovementId,
		m.thirdPartyAccountId,
		a.companyId,
		a.customerId,
		a.supplierId,
		m.thirdPartyMovementTypeId,
		t.vcCode AS typeCode,
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
		m.dtCreatedAt,
		m.dtLastUpdated
	FROM dbo.tblThirdPartyAccountMovement AS m
	INNER JOIN dbo.tblThirdPartyAccount AS a
		ON a.thirdPartyAccountId = m.thirdPartyAccountId
	INNER JOIN dbo.tblRefThirdPartyMovementType AS t
		ON t.thirdPartyMovementTypeId = m.thirdPartyMovementTypeId;
GO
/****** Objet : View [dbo].[vw_TreasuryAccountDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  1. VUES (Lecture et dénormalisation pour l'API)
==============================================================================*/

/*------------------------------------------------------------------------------
  vw_TreasuryAccountDetails
  Rôle : Retourne les comptes de trésorerie en incluant le libellé de leur type
         (ex: 'Caisse centrale', 'Orange Money') pour faciliter l'affichage Frontend.
------------------------------------------------------------------------------*/
CREATE   VIEW [dbo].[vw_TreasuryAccountDetails]
AS
	SELECT
		a.treasuryAccountId,
		a.companyId,
		a.storeId,
		a.treasuryAccountTypeId,
		t.vcCode AS typeCode,
		t.vcTreasuryAccountType,
		a.vcAccountName,
		a.mCurrentBalance,
		a.btEnabled,
		a.dtCreatedAt,
		a.dtLastUpdated
	FROM dbo.tblTreasuryAccount AS a
	INNER JOIN dbo.tblRefTreasuryAccountType AS t
		ON t.treasuryAccountTypeId = a.treasuryAccountTypeId;
GO
/****** Objet : View [dbo].[vw_TreasuryMovementDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  vw_TreasuryMovementDetails
  Rôle : Historique des mouvements enrichi avec le type de mouvement, 
         la direction (+1/-1) et le nom complet de l'opérateur.
------------------------------------------------------------------------------*/
CREATE   VIEW [dbo].[vw_TreasuryMovementDetails]
AS
	SELECT
		m.treasuryMovementId,
		m.treasuryAccountId,
		a.companyId,
		a.storeId,
		m.treasuryMovementTypeId,
		t.vcCode AS typeCode,
		t.vcTreasuryMovementType,
		t.direction,
		m.cashReportId,
		m.mAmount,
		m.mBalanceBefore,
		m.mBalanceAfter,
		m.vcDescription,
		m.OperatedByUserId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS operatedByName,
		m.btEnabled,
		m.dtCreatedAt,
		m.dtLastUpdated
	FROM dbo.tblTreasuryMovement AS m
	INNER JOIN dbo.tblTreasuryAccount AS a ON a.treasuryAccountId = m.treasuryAccountId
	INNER JOIN dbo.tblRefTreasuryMovementType AS t
		ON t.treasuryMovementTypeId = m.treasuryMovementTypeId
	INNER JOIN dbo.tblUser AS u ON u.userId = m.OperatedByUserId;
GO
/****** Objet : View [dbo].[vw_UserActiveAuthorizationScope] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  vw_UserActiveAuthorizationScope
  Rôle : CŒUR DU SYSTÈME DE SÉCURITÉ. Cette vue détermine les périmètres d'action 
         réels et actifs d'un utilisateur.
  Règle spéciale : Le SuperAdmin reste actif même si son compte est désactivé 
                   (btIsActive non filtré pour lui) pour éviter un blocage total.
------------------------------------------------------------------------------*/
CREATE   VIEW [dbo].[vw_UserActiveAuthorizationScope]
AS
    -- 1. Périmètre GLOBAL (SuperAdmin)
    SELECT uc.userId, CAST('GLOBAL' AS varchar(10)) AS scopeType, CAST(NULL AS int) AS companyId, CAST(NULL AS int) AS storeId,
           uc.roleId, r.vcCode AS roleCode, r.vcRole AS roleName
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    WHERE uc.btEnabled = 1 AND uc.companyId IS NULL AND r.vcCode = 'SUPER_ADMIN'
    UNION ALL
    -- 2. Périmètre ENTREPRISE (Admin)
    SELECT uc.userId, CAST('COMPANY' AS varchar(10)) AS scopeType, uc.companyId, CAST(NULL AS int) AS storeId,
           uc.roleId, r.vcCode AS roleCode, r.vcRole AS roleName
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblUser AS u ON u.userId = uc.userId
    INNER JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    WHERE uc.btEnabled = 1 AND uc.companyId IS NOT NULL AND u.btIsActive = 1 AND c.btEnabled = 1 AND r.vcCode = 'ADMIN'
    UNION ALL
    -- 3. Périmètre BOUTIQUE (Manager, Caissier)
    SELECT us.userId, CAST('STORE' AS varchar(10)) AS scopeType, s.companyId, us.storeId,
           us.roleId, r.vcCode AS roleCode, r.vcRole AS roleName
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
    INNER JOIN dbo.tblUser AS u ON u.userId = us.userId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
    WHERE us.btEnabled = 1 AND us.dtEndDate IS NULL AND u.btIsActive = 1 AND s.btEnabled = 1 AND c.btEnabled = 1 AND r.vcCode IN ('MANAGER', 'CASHIER');
GO
/****** Objet : View [dbo].[vw_UserAssignmentContext] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  vw_UserAssignmentContext
  Rôle : Vue d'union (UNION ALL) qui normalise les affectations d'un utilisateur.
         Elle permet de voir d'un seul coup d'œil si un utilisateur est rattaché 
         à une Entreprise (COMPANY) ou à une Boutique (STORE).
------------------------------------------------------------------------------*/
CREATE   VIEW [dbo].[vw_UserAssignmentContext]
AS
    -- Contexte Entreprise
    SELECT uc.userId, uc.userCompanyId AS assignmentId, CAST('COMPANY' AS varchar(10)) AS scopeType,
           uc.companyId, c.vcCompanyName, CAST(NULL AS int) AS storeId, CAST(NULL AS varchar(50)) AS vcStoreName,
           uc.roleId, r.vcCode AS roleCode, r.vcRole AS roleName, uc.dtAssignedAt AS assignedAt
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
    WHERE uc.btEnabled = 1 AND uc.companyId IS NOT NULL
    UNION ALL
    -- Contexte Boutique
    SELECT us.userId, us.userStoreId AS assignmentId, CAST('STORE' AS varchar(10)) AS scopeType,
           s.companyId, c.vcCompanyName, s.storeId, s.vcStoreName,
           us.roleId, r.vcCode AS roleCode, r.vcRole AS roleName, us.dtStartDate AS assignedAt
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
    WHERE us.btEnabled = 1;
GO
/****** Objet : View [dbo].[vw_UserCompanyAccess] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Affectations entreprise avec role, dont l'affectation globale SUPER_ADMIN (companyId NULL). */
CREATE   VIEW [dbo].[vw_UserCompanyAccess]
AS
	SELECT
		uc.userId,
		uc.companyId,
		c.vcCompanyCode,
		c.vcCompanyName,
		c.vcCity,
		c.btEnabled AS companyEnabled,
		uc.roleId,
		r.vcCode AS roleCode,
		r.vcRole AS roleName,
		uc.btEnabled,
		uc.dtAssignedAt,
		uc.dtEndedAt
	FROM dbo.tblUserCompany AS uc
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
	INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId;
GO
/****** Objet : View [dbo].[vw_UserCompanyDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   VIEW [dbo].[vw_UserCompanyDetails]
AS
    SELECT uc.userCompanyId, uc.userId, u.vcLastName, u.vcFirstName, u.vcEmail, u.vcPhoneNumber,
           uc.companyId, c.vcCompanyCode, c.vcCompanyName,
           uc.roleId, r.vcCode AS roleCode, r.vcRole AS roleName,
           uc.createdByUserId, uc.dtAssignedAt, uc.dtEndedAt, uc.btEnabled
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblUser AS u ON u.userId = uc.userId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId;
GO
/****** Objet : View [dbo].[vw_UserDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  1. VUES (Vues de lecture et de sécurité)
==============================================================================*/

/*------------------------------------------------------------------------------
  vw_UserDetails
  Rôle : Profil utilisateur complet avec le libellé du genre et le nom complet 
         concaténé. Utilisé pour l'affichage dans le frontend.
------------------------------------------------------------------------------*/
CREATE   VIEW [dbo].[vw_UserDetails]
AS
    SELECT
        u.userId, u.vcLastName, u.vcFirstName,
        LTRIM(RTRIM(u.vcLastName + N' ' + ISNULL(u.vcFirstName, N''))) AS vcFullName,
        u.genderId, g.vcCode AS genderCode, g.vcGender,
        u.vcEmail, u.vcPhoneNumber, u.vcAddress, u.vcPhotoUrl,
        u.dtLastLoginAt, u.btIsActive, u.dtCreatedAt, u.dtLastUpdated
    FROM dbo.tblUser AS u
    LEFT JOIN dbo.tblRefGender AS g ON g.genderId = u.genderId;
GO
/****** Objet : View [dbo].[vw_UserStoreDetails] Date de script : 19/11/2026 10:43:31 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  vw_UserStoreDetails & vw_UserCompanyDetails
  Rôle : Vues de dénormalisation pour faciliter les SELECT dans le code Node.js 
         (évite de faire des jointures complexes côté API).
------------------------------------------------------------------------------*/
CREATE   VIEW [dbo].[vw_UserStoreDetails]
AS
    SELECT us.userStoreId, us.userId, u.vcLastName, u.vcFirstName, u.vcEmail, u.vcPhoneNumber,
           us.storeId, s.vcStoreCode, s.vcStoreName, s.companyId,
           us.roleId, r.vcCode AS roleCode, r.vcRole AS roleName,
           us.assignedByUserId, us.dtStartDate, us.dtEndDate, us.btEnabled
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblUser AS u ON u.userId = us.userId
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId;
GO