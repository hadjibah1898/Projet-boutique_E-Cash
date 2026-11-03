/*
  Module depenses - SQL Server.
  Prerequis: dbo.tblExpenseCategory, dbo.tblExpense, dbo.tblStore,
             dbo.tblUser, dbo.tblCashSession.
  Les filtres des listes suivent les methodes actuelles d'expenseDAL.js.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Depenses enrichies de la categorie et des noms de createur/approbateur. */
CREATE OR ALTER VIEW dbo.vw_ExpenseDetails
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

CREATE OR ALTER VIEW dbo.vw_ExpenseCategoryDetails
AS
	SELECT expenseCategoryId, companyId, vcExpenseCategoryCode,
		vcExpenseCategory, btEnabled
	FROM dbo.tblExpenseCategory;
GO

/* Cree une categorie de depenses active. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateExpenseCategory
	@companyId int,
	@vcExpenseCategoryCode varchar(20),
	@vcExpenseCategory varchar(30)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0 THROW 52800, 'companyId invalide.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcExpenseCategoryCode)), '') IS NULL THROW 52801, 'vcExpenseCategoryCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcExpenseCategory)), '') IS NULL THROW 52802, 'vcExpenseCategory est obligatoire.', 1;
		INSERT INTO dbo.tblExpenseCategory(companyId,vcExpenseCategoryCode,vcExpenseCategory,btEnabled)
		OUTPUT INSERTED.expenseCategoryId,INSERTED.companyId,INSERTED.vcExpenseCategoryCode,INSERTED.vcExpenseCategory,INSERTED.btEnabled
		VALUES(@companyId,LTRIM(RTRIM(@vcExpenseCategoryCode)),LTRIM(RTRIM(@vcExpenseCategory)),1);
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetExpenseCategoriesByCompany
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0 THROW 52800, 'companyId invalide.', 1;
		SELECT expenseCategoryId,companyId,vcExpenseCategoryCode,vcExpenseCategory
		FROM dbo.vw_ExpenseCategoryDetails
		WHERE companyId=@companyId AND btEnabled=1
		ORDER BY vcExpenseCategory;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Cree une depense avec le statut fourni par le DAL (PENDING par defaut). */
CREATE OR ALTER PROCEDURE dbo.sp_CreateExpense
	@cashSessionId int=NULL,
	@storeId int,
	@expenseCategoryId int,
	@mAmount money,
	@vcReason varchar(150),
	@vcProofUrl varchar(255)=NULL,
	@vcStatusCode varchar(20)='PENDING',
	@createdByUserId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @mAmount IS NULL OR @mAmount<=0 THROW 52803, 'mAmount doit etre strictement superieur a zero.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcReason)), '') IS NULL THROW 52804, 'vcReason est obligatoire.', 1;
		IF @storeId IS NULL OR @storeId<=0 THROW 52805, 'storeId invalide.', 1;
		IF @expenseCategoryId IS NULL OR @expenseCategoryId<=0 THROW 52806, 'expenseCategoryId invalide.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId<=0 THROW 52807, 'createdByUserId invalide.', 1;
		INSERT INTO dbo.tblExpense(
			cashSessionId,storeId,expenseCategoryId,mAmount,vcReason,vcProofUrl,vcStatusCode,
			createdByUserId,approvedByUserId,dtApprovedAt,dtCreatedAt
		)
		OUTPUT INSERTED.expenseId,INSERTED.cashSessionId,INSERTED.storeId,
			INSERTED.expenseCategoryId,INSERTED.mAmount,INSERTED.vcReason,
			INSERTED.vcStatusCode,INSERTED.dtCreatedAt
		VALUES(@cashSessionId,@storeId,@expenseCategoryId,@mAmount,LTRIM(RTRIM(@vcReason)),
			@vcProofUrl,@vcStatusCode,@createdByUserId,NULL,NULL,SYSUTCDATETIME());
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetExpensesByStore
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId<=0 THROW 52805, 'storeId invalide.', 1;
		SELECT expenseId,cashSessionId,storeId,vcExpenseCategory,mAmount,vcReason,vcProofUrl,vcStatusCode,
			createdByUserId,createdByName,approvedByUserId,dtApprovedAt,dtCreatedAt
		FROM dbo.vw_ExpenseDetails WHERE storeId=@storeId
		ORDER BY dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetExpensesByCashSession
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId<=0 THROW 52808, 'cashSessionId invalide.', 1;
		SELECT expenseId,cashSessionId,storeId,vcExpenseCategory,mAmount,vcReason,vcProofUrl,vcStatusCode,
			createdByUserId,createdByName,approvedByUserId,dtApprovedAt,dtCreatedAt
		FROM dbo.vw_ExpenseDetails WHERE cashSessionId=@cashSessionId
		ORDER BY dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Resume globale d'une session, y compris les statuts autres que APPROVED. */
CREATE OR ALTER PROCEDURE dbo.sp_GetExpenseSessionSummary
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId<=0 THROW 52808, 'cashSessionId invalide.', 1;
		SELECT COUNT(1) AS nbDepenses,
			COALESCE(SUM(mAmount),0) AS mTotalExpenses,
			COALESCE(SUM(CASE WHEN vcStatusCode='APPROVED' THEN mAmount ELSE 0 END),0) AS mTotalApproved
		FROM dbo.tblExpense WHERE cashSessionId=@cashSessionId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetTotalApprovedExpensesBySession
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId<=0 THROW 52808, 'cashSessionId invalide.', 1;
		SELECT COALESCE(SUM(mAmount),0) AS totalApproved
		FROM dbo.tblExpense WHERE cashSessionId=@cashSessionId AND vcStatusCode='APPROVED';
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Approuve ou rejette uniquement une depense PENDING. */
CREATE OR ALTER PROCEDURE dbo.sp_DecideExpense
	@expenseId int,
	@approvedByUserId int,
	@vcStatusCode varchar(20)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @expenseId IS NULL OR @expenseId<=0 THROW 52809, 'expenseId invalide.', 1;
		IF @approvedByUserId IS NULL OR @approvedByUserId<=0 THROW 52807, 'approvedByUserId invalide.', 1;
		IF @vcStatusCode NOT IN ('APPROVED','REJECTED') THROW 52810, 'Statut attendu: APPROVED ou REJECTED.', 1;
		UPDATE dbo.tblExpense
		SET vcStatusCode=@vcStatusCode,approvedByUserId=@approvedByUserId,dtApprovedAt=SYSUTCDATETIME()
		OUTPUT INSERTED.expenseId,INSERTED.vcStatusCode,INSERTED.dtApprovedAt
		WHERE expenseId=@expenseId AND vcStatusCode='PENDING';
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
