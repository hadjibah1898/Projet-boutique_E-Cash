USE [GestionsBoutiques]
GO
/****** Objet : StoredProcedure [dbo].[_Sp_UpdateTempUserPassword] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER OFF
GO
CREATE PROCEDURE [dbo].[_Sp_UpdateTempUserPassword]
    @email NVARCHAR(200),
    @newHash NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.tblUser 
    SET vcPasswordHash = @newHash, 
        dtLastUpdated = GETUTCDATE()
    WHERE vcEmail = @email;
    SELECT 'Password hash updated' AS status;
END
GO
/****** Objet : StoredProcedure [dbo].[_Temp_UpdatePassword] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER OFF
GO
CREATE PROCEDURE [dbo].[_Temp_UpdatePassword]
    @email VARCHAR(200),
    @newHash VARCHAR(MAX)
AS
BEGIN
    UPDATE dbo.tblUser 
    SET vcPasswordHash = @newHash, 
        dtLastUpdated = GETUTCDATE()
    WHERE vcEmail = @email;
END

GO
/****** Objet : StoredProcedure [dbo].[sp_AddPriceHistory] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- 🟢 Procédure pour l'historique des prix
CREATE   PROCEDURE [dbo].[sp_AddPriceHistory]
    @storeId int,
    @productId bigint,
    @mPurchasePrice money,
    @mSalePrice money,
    @createdByUserId int
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO dbo.tblProductPriceHistory 
        (productId, storeId, mPurchasePrice, mSalePrice, dtEffectiveFrom, dtEffectiveTo, createdByUserId)
        VALUES 
        (@productId, @storeId, @mPurchasePrice, @mSalePrice, GETDATE(), NULL, @createdByUserId);
    END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_AddSalePayment] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Ajoute un paiement en attente et met a jour les montants de l'entete atomiquement. */
CREATE   PROCEDURE [dbo].[sp_AddSalePayment]
	@saleId bigint,
	@paymentMethodId int,
	@paymentStatusId int,
	@mAmount money,
	@vcTransactionId varchar(150) = NULL,
	@vcOperatorReference varchar(150) = NULL,
	@vcPayerPhoneNumber varchar(20) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @saleId IS NULL OR @saleId <= 0 THROW 52111, 'saleId invalide.', 1;
		IF @mAmount IS NULL OR @mAmount <= 0 THROW 52112, 'mAmount doit etre superieur a zero.', 1;
		BEGIN TRANSACTION;
		DECLARE @net money, @paid money, @debt money, @cancelled bit;
		SELECT @net = mNetAmount, @paid = mPaidAmount, @debt = mDebtAmount, @cancelled = IsCancelled
		FROM dbo.tblSale WITH (UPDLOCK, HOLDLOCK) WHERE saleId = @saleId;
		IF @net IS NULL THROW 52113, 'Vente introuvable.', 1;
		IF @cancelled = 1 THROW 52114, 'Impossible de payer une vente annulee.', 1;
		IF @debt <= 0 THROW 52115, 'Cette vente est deja entierement payee.', 1;
		DECLARE @amountToApply money = CASE WHEN @mAmount > @debt THEN @debt ELSE @mAmount END;
		DECLARE @payment table (salePaymentId bigint);
		INSERT INTO dbo.tblSalePayment (
			saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			vcCallbackPayload, OperatorMessage, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.salePaymentId INTO @payment(salePaymentId)
		VALUES (@saleId, @paymentMethodId, @paymentStatusId, @amountToApply,
			@vcTransactionId, @vcOperatorReference, @vcPayerPhoneNumber,
			NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME());
		UPDATE dbo.tblSale
		SET mPaidAmount = mPaidAmount + @amountToApply,
			mDebtAmount = mDebtAmount - @amountToApply,
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.mPaidAmount, INSERTED.mDebtAmount
		WHERE saleId = @saleId;
		COMMIT TRANSACTION;
		SELECT salePaymentId, @amountToApply AS mAmount FROM @payment;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_AddStoreProduct] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_AddStoreProduct]
	@storeId int,
	@productId bigint,
	@mCurrentSalePrice money,
	@mPurchasePrice money = 0, -- 🟢 NOUVEAU PARAMÈTRE AJOUTÉ ICI
	@alertThreshold int=NULL,
	@createdByUserId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @mCurrentSalePrice IS NULL OR @mCurrentSalePrice<0 THROW 52512, 'mCurrentSalePrice doit etre positif ou nul.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId<=0 THROW 52506, 'createdByUserId invalide.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblStore WHERE storeId=@storeId)
			THROW 52511, 'Boutique introuvable.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblProduct AS p
			INNER JOIN dbo.tblStore AS s ON s.storeId=@storeId
			WHERE p.productId=@productId AND p.companyId=s.companyId
		)
			THROW 52513, 'Produit absent ou rattache a une autre entreprise que la boutique.', 1;
		BEGIN TRANSACTION;
		DECLARE @created table(storeProductId int,storeId int,productId bigint,mCurrentSalePrice money,alertThreshold int NULL);
		
		INSERT INTO dbo.tblStoreProduct(storeId,productId,mCurrentSalePrice,alertThreshold,btEnabled,dtCreatedAt,dtLastUpdated)
		OUTPUT INSERTED.storeProductId,INSERTED.storeId,INSERTED.productId,INSERTED.mCurrentSalePrice,INSERTED.alertThreshold
		INTO @created(storeProductId,storeId,productId,mCurrentSalePrice,alertThreshold)
		VALUES(@storeId,@productId,@mCurrentSalePrice,@alertThreshold,1,SYSUTCDATETIME(),SYSUTCDATETIME());
		
		-- 🟢 CORRECTION ICI : On remplace NULL par @mPurchasePrice
		INSERT INTO dbo.tblProductPriceHistory(storeId,productId,mPurchasePrice,mSalePrice,dtEffectiveFrom,dtEffectiveTo,createdByUserId)
		VALUES(@storeId,@productId,@mPurchasePrice,@mCurrentSalePrice,SYSUTCDATETIME(),NULL,@createdByUserId);
		
		COMMIT TRANSACTION;
		SELECT * FROM @created;
	END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK TRANSACTION; THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_AddSupplierProduct] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Associe un produit a un fournisseur. */
CREATE   PROCEDURE [dbo].[sp_AddSupplierProduct]
	@supplierId int,
	@productId bigint,
	@vcSupplierReference varchar(50) = NULL,
	@mReferencePurchasePrice money = NULL,
	@deliveryLeadTimeDays int = NULL,
	@isPreferred bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;
		IF @productId IS NULL OR @productId <= 0
			THROW 51505, 'productId est obligatoire et doit etre positif.', 1;

		INSERT INTO dbo.tblSupplierProduct (
			supplierId, productId, vcSupplierReference, mReferencePurchasePrice,
			deliveryLeadTimeDays, IsPreferred, btEnabled
		)
		OUTPUT INSERTED.supplierProductId, INSERTED.supplierId, INSERTED.productId
		VALUES (
			@supplierId, @productId, @vcSupplierReference, @mReferencePurchasePrice,
			@deliveryLeadTimeDays, @isPreferred, 1
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_ApplyStoreStockDeltaForStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Applique un delta atomique et retourne les valeurs before/after du DAL. */
CREATE   PROCEDURE [dbo].[sp_ApplyStoreStockDeltaForStore]
	@storeId int,
	@productId bigint,
	@delta decimal(18, 3)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51600, 'storeId est obligatoire et doit etre positif.', 1;
		IF @productId IS NULL OR @productId <= 0
			THROW 51601, 'productId est obligatoire et doit etre positif.', 1;
		IF @delta IS NULL OR @delta = 0
			THROW 51602, 'Le delta de stock ne peut pas etre nul.', 1;

		DECLARE @changed table (
			[before] decimal(18, 3),
			[after] decimal(18, 3)
		);
		UPDATE dbo.tblStoreStock WITH (UPDLOCK, ROWLOCK)
		SET dcAvailableQuantity = dcAvailableQuantity + @delta,
			dtUpdatedAt = SYSUTCDATETIME()
		OUTPUT DELETED.dcAvailableQuantity, INSERTED.dcAvailableQuantity
			INTO @changed ([before], [after])
		WHERE storeId = @storeId AND productId = @productId
		  AND (@delta > 0 OR dcAvailableQuantity + @delta >= 0);

		IF EXISTS (SELECT 1 FROM @changed)
		BEGIN
			SELECT [before], [after] FROM @changed;
			RETURN;
		END;

		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblStoreStock
			WHERE storeId = @storeId AND productId = @productId
		)
			THROW 51603, 'Aucune ligne de stock initialisee pour ce produit et cette boutique.', 1;
		THROW 51604, 'Stock insuffisant pour appliquer le delta demande.', 1;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_ApproveCashReport] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_ApproveCashReport]
    @cashReportId INT,
    @level VARCHAR(10),
    @userId INT,
    @isApproved BIT,
    @comment VARCHAR(250) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY

        BEGIN TRANSACTION;

        DECLARE
            @currentCode VARCHAR(50),
            @targetCode VARCHAR(50),
            @targetStatusId INT,
            @managerSessionId INT,
            @companyId INT,
            @totalCash MONEY;

        -- 1. RECUPERATION DES INFORMATIONS DU RAPPORT
        SELECT
            @currentCode = rs.vcCode,
            @companyId = s.companyId,
            @totalCash = cr.mTotalCash
        FROM dbo.tblCashReport cr WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.tblRefCashReportStatus rs
            ON rs.cashReportStatusId = cr.cashReportStatusId
        INNER JOIN dbo.tblCashSession cs
            ON cs.cashSessionId = cr.cashSessionId
        INNER JOIN dbo.tblCashRegister r
            ON r.cashRegisterId = cs.cashRegisterId
        INNER JOIN dbo.tblStore s
            ON s.storeId = r.storeId
        WHERE cr.cashReportId = @cashReportId;

        IF @currentCode IS NULL
            THROW 53208, 'Rapport de caisse introuvable.', 1;

        IF @level NOT IN ('MANAGER', 'ADMIN')
            THROW 53210, 'Niveau de validation invalide.', 1;

        -- Protection contre une double validation ADMIN
        IF @level = 'ADMIN' AND @currentCode = 'APPROVED'
            THROW 53211, 'Ce rapport est deja valide par ADMIN.', 1;

        SET @totalCash = ISNULL(@totalCash, 0);

        -- 2. DETERMINATION DU STATUT CIBLE
        IF @level = 'MANAGER'
        BEGIN
            SELECT TOP 1
                @managerSessionId = cashSessionId
            FROM dbo.tblCashSession
            WHERE userId = @userId
              AND cashSessionStatusId = (
                  SELECT cashSessionStatusId
                  FROM dbo.tblRefCashSessionStatus
                  WHERE vcCode = 'OPEN'
              )
            ORDER BY dtOpenedAt DESC;

            SET @targetCode =
                CASE
                    WHEN @isApproved = 1
                    THEN 'PENDING_ADMIN'
                    ELSE 'REJECTED'
                END;
        END
        ELSE
        BEGIN
            SET @targetCode =
                CASE
                    WHEN @isApproved = 1
                    THEN 'APPROVED'
                    ELSE 'REJECTED'
                END;
        END;

        SELECT
            @targetStatusId = cashReportStatusId
        FROM dbo.tblRefCashReportStatus
        WHERE vcCode = @targetCode;

        IF @targetStatusId IS NULL
            THROW 53209, 'Statut cible du rapport introuvable.', 1;

        -- 3. MISE A JOUR DU RAPPORT
        IF @level = 'MANAGER'
        BEGIN
            UPDATE dbo.tblCashReport
            SET
                cashReportStatusId = @targetStatusId,
                managerApprovedByUserId = @userId,
                dtManagerApprovedAt = GETDATE(),
                managerSessionId = @managerSessionId,
                vcManagerComment = @comment,
                dtLastUpdated = GETDATE()
            WHERE cashReportId = @cashReportId;
        END
        ELSE
        BEGIN
            UPDATE dbo.tblCashReport
            SET
                cashReportStatusId = @targetStatusId,
                adminApprovedByUserId = @userId,
                dtAdminApprovedAt = GETDATE(),
                vcAdminComment = @comment,
                dtLastUpdated = GETDATE()
            WHERE cashReportId = @cashReportId;
        END;

        -- 4. TRANSFERT DES ESPECES VERS LA CAISSE CENTRALE
        -- IMPORTANT :
        -- Le rapport est valide meme si mTotalCash = 0.
        -- Aucun mouvement de tresorerie nul ne sera cree.

        IF @level = 'ADMIN'
           AND @isApproved = 1
           AND @totalCash > 0
        BEGIN

            DECLARE @treasuryAccountId INT;
            DECLARE @treasuryTypeId INT;
            DECLARE @movementTypeId INT;

            SELECT TOP 1
                @treasuryTypeId = treasuryAccountTypeId
            FROM dbo.tblRefTreasuryAccountType
            WHERE vcCode = 'CENTRAL_CASH';

            IF @treasuryTypeId IS NULL
                THROW 53212, 'Type de compte CENTRAL_CASH introuvable.', 1;

            -- Recherche de la Caisse Centrale
            SELECT TOP 1
                @treasuryAccountId = treasuryAccountId
            FROM dbo.tblTreasuryAccount WITH (UPDLOCK, HOLDLOCK)
            WHERE companyId = @companyId
              AND storeId IS NULL
              AND treasuryAccountTypeId = @treasuryTypeId;

            -- Creation du compte si necessaire
            IF @treasuryAccountId IS NULL
            BEGIN
                INSERT INTO dbo.tblTreasuryAccount
                (
                    companyId,
                    storeId,
                    treasuryAccountTypeId,
                    vcAccountName,
                    mCurrentBalance,
                    btEnabled,
                    dtCreatedAt,
                    dtLastUpdated
                )
                VALUES
                (
                    @companyId,
                    NULL,
                    @treasuryTypeId,
                    'Caisse Centrale',
                    0,
                    1,
                    GETDATE(),
                    GETDATE()
                );

                SET @treasuryAccountId = SCOPE_IDENTITY();
            END;

            -- Recuperation du solde actuel
            DECLARE @currentBalance MONEY;
            DECLARE @newBalance MONEY;

            SELECT
                @currentBalance = mCurrentBalance
            FROM dbo.tblTreasuryAccount WITH (UPDLOCK)
            WHERE treasuryAccountId = @treasuryAccountId;

            SET @currentBalance = ISNULL(@currentBalance, 0);

            SET @newBalance = @currentBalance + @totalCash;

            -- Mise a jour du compte
            UPDATE dbo.tblTreasuryAccount
            SET
                mCurrentBalance = @newBalance,
                dtLastUpdated = GETDATE()
            WHERE treasuryAccountId = @treasuryAccountId;

            -- Type de mouvement
            SELECT TOP 1
                @movementTypeId = treasuryMovementTypeId
            FROM dbo.tblRefTreasuryMovementType
            WHERE vcCode = 'CASH_REPORT_IN';

            IF @movementTypeId IS NULL
                THROW 53213, 'Type de mouvement CASH_REPORT_IN introuvable.', 1;

            -- Historique du transfert
            INSERT INTO dbo.tblTreasuryMovement
            (
                treasuryAccountId,
                treasuryMovementTypeId,
                cashReportId,
                mAmount,
                mBalanceBefore,
                mBalanceAfter,
                vcDescription,
                OperatedByUserId,
                btEnabled,
                dtCreatedAt,
                dtLastUpdated
            )
            VALUES
            (
                @treasuryAccountId,
                @movementTypeId,
                @cashReportId,
                @totalCash,
                @currentBalance,
                @newBalance,
                'Encaissement rapport de caisse',
                @userId,
                1,
                GETDATE(),
                GETDATE()
            );

        END;

        -- 5. VALIDATION FINALE
        COMMIT TRANSACTION;

    END TRY
    BEGIN CATCH

        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;

    END CATCH;
END;

GO
/****** Objet : StoredProcedure [dbo].[sp_AssignUserToCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  7.2 sp_AssignUserToCompany
      Affecte un rôle à un utilisateur dans une entreprise.
      Réservée au SuperAdmin (création de compte Admin).
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_AssignUserToCompany]
    @userId          int,
    @companyId       int,
    @roleId          int,
    @createdByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51230, 'userId est obligatoire et doit être positif.', 1;
        IF @companyId IS NULL OR @companyId <= 0
            THROW 51231, 'companyId est obligatoire et doit être positif.', 1;
        IF @roleId IS NULL OR @roleId <= 0
            THROW 51232, 'roleId est obligatoire et doit être positif.', 1;

        /* Contrôle d'autorisation : SuperAdmin uniquement */
        IF @createdByUserId IS NULL OR NOT EXISTS (
            SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
            WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN'
        )
            THROW 51234, 'Seul un SuperAdmin peut affecter le rôle ADMIN.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblRefRole WHERE roleId = @roleId AND vcCode = 'ADMIN' AND btEnabled = 1)
            THROW 51235, 'Une affectation entreprise doit utiliser le rôle ADMIN.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblUser WHERE userId = @userId AND btIsActive = 1)
            THROW 51230, 'Utilisateur cible introuvable ou inactif.', 1;

        INSERT INTO dbo.tblUserCompany (
            userId, companyId, roleId, createdByUserId,
            dtAssignedAt, dtEndedAt, btEnabled
        )
        OUTPUT
            INSERTED.userCompanyId, INSERTED.userId, INSERTED.companyId,
            INSERTED.roleId, INSERTED.dtAssignedAt
        VALUES (
            @userId, @companyId, @roleId, @createdByUserId,
            SYSUTCDATETIME(), NULL, 1
        );
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_AssignUserToStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  7. AFFECTATIONS
==============================================================================*/

/*------------------------------------------------------------------------------
  7.1 sp_AssignUserToStore
      Affecte un utilisateur à une boutique.

      Autorisation : SuperAdmin, Admin de l'entreprise, ou Manager de la
      boutique. Un Manager ne peut affecter que des Caissiers.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_AssignUserToStore]
    @userId           int,
    @storeId          int,
    @roleId           int,
    @assignedByUserId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- Validations d'entrée --- */
        IF @userId IS NULL OR @userId <= 0
            THROW 51220, 'userId est obligatoire et doit être positif.', 1;
        IF @storeId IS NULL OR @storeId <= 0
            THROW 51221, 'storeId est obligatoire et doit être positif.', 1;
        IF @roleId IS NULL OR @roleId <= 0
            THROW 51222, 'roleId est obligatoire et doit être positif.', 1;
        IF @assignedByUserId IS NULL OR @assignedByUserId <= 0
            THROW 51223, 'assignedByUserId est obligatoire et doit être positif.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblUser WHERE userId = @userId AND btIsActive = 1)
            THROW 51220, 'Utilisateur cible introuvable ou inactif.', 1;

        DECLARE @targetCompanyId int;
        DECLARE @targetRoleCode varchar(50);
        DECLARE @isSuperAdmin bit = 0;
        DECLARE @isCompanyAdmin bit = 0;
        DECLARE @isStoreManager bit = 0;

        SELECT @targetCompanyId = companyId
        FROM dbo.tblStore
        WHERE storeId = @storeId AND btEnabled = 1;
        IF @targetCompanyId IS NULL
            THROW 51221, 'Boutique introuvable ou inactive.', 1;

        /* --- Détermination du périmètre de l'auteur --- */
        SELECT @isSuperAdmin = 1
        FROM dbo.vw_UserActiveAuthorizationScope
        WHERE userId = @assignedByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN';

        SELECT @isCompanyAdmin = 1
        FROM dbo.vw_UserActiveAuthorizationScope
        WHERE userId = @assignedByUserId AND scopeType = 'COMPANY'
          AND companyId = @targetCompanyId AND roleCode = 'ADMIN';

        SELECT @isStoreManager = 1
        FROM dbo.vw_UserActiveAuthorizationScope
        WHERE userId = @assignedByUserId AND scopeType = 'STORE'
          AND storeId = @storeId AND roleCode = 'MANAGER';

        IF @isSuperAdmin = 0 AND @isCompanyAdmin = 0 AND @isStoreManager = 0
            THROW 51226, 'Auteur non autorisé pour cette boutique.', 1;

        /* Un Manager ne peut affecter que le rôle CASHIER */
        IF @isStoreManager = 1 AND @isSuperAdmin = 0 AND @isCompanyAdmin = 0
            SET @roleId = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'CASHIER' AND btEnabled = 1);

        /* Validation du rôle cible */
        SELECT @targetRoleCode = vcCode
        FROM dbo.tblRefRole
        WHERE roleId = @roleId AND btEnabled = 1;
        IF @targetRoleCode IS NULL OR @targetRoleCode NOT IN ('MANAGER', 'CASHIER')
            THROW 51225, 'Seuls les rôles MANAGER et CASHIER peuvent être affectés à une boutique.', 1;

        /* Protection : impossible de modifier un compte SuperAdmin ou Admin */
        IF (@isCompanyAdmin = 1 OR @isStoreManager = 1)
           AND EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @userId AND roleCode IN ('SUPER_ADMIN', 'ADMIN')
           )
            THROW 51229, 'Impossible de modifier un compte SuperAdmin ou Admin.', 1;

        /* Restrictions spécifiques au Manager */
        IF @isStoreManager = 1 AND @isSuperAdmin = 0 AND @isCompanyAdmin = 0
        BEGIN
            IF EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @userId AND roleCode = 'MANAGER'
            )
                THROW 51227, 'Un gérant ne peut gérer que des comptes caissier.', 1;

            IF EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @userId AND scopeType = 'STORE'
                  AND roleCode = 'CASHIER' AND storeId <> @storeId
            )
                THROW 51228, 'Un gérant ne peut pas déplacer un caissier vers une autre boutique.', 1;
        END;

        /* --- Insertion de l'affectation --- */
        INSERT INTO dbo.tblUserStore (
            userId, storeId, roleId, assignedByUserId,
            dtStartDate, dtEndDate, btEnabled
        )
        OUTPUT
            INSERTED.userStoreId, INSERTED.userId, INSERTED.storeId,
            INSERTED.roleId, INSERTED.dtStartDate
        VALUES (
            @userId, @storeId, @roleId, @assignedByUserId,
            SYSUTCDATETIME(), NULL, 1
        );
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CancelPurchase] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Annule uniquement un achat DRAFT ou ORDERED. */
CREATE   PROCEDURE [dbo].[sp_CancelPurchase]
	@purchaseId int,
	@cancelledStatusId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @purchaseId IS NULL OR @purchaseId<=0 THROW 52305, 'purchaseId invalide.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefPurchaseStatus WHERE purchaseStatusId=@cancelledStatusId AND vcCode='CANCELLED')
			THROW 52314, 'Statut CANCELLED absent ou invalide.', 1;
		UPDATE dbo.tblPurchase
		SET purchaseStatusId=@cancelledStatusId,dtLastUpdated=SYSUTCDATETIME()
		WHERE purchaseId=@purchaseId AND purchaseStatusId IN(
			SELECT purchaseStatusId FROM dbo.tblRefPurchaseStatus WHERE vcCode IN('DRAFT','ORDERED')
		);
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CancelSale] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Annule une vente et restaure le stock par mouvements SALE_CANCEL. */
CREATE   PROCEDURE [dbo].[sp_CancelSale]
	@saleId bigint,
	@cancelledByUserId int,
	@vcCancellationReason varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		BEGIN TRANSACTION;
		DECLARE @storeId int, @saleNumber varchar(20), @cancelled bit, @cancelStatusId int;
		SELECT @storeId=storeId,@saleNumber=vcSaleNumber,@cancelled=IsCancelled
		FROM dbo.tblSale WITH (UPDLOCK,HOLDLOCK) WHERE saleId=@saleId;
		IF @storeId IS NULL THROW 52113, 'Vente introuvable.', 1;
		IF @cancelled=1 THROW 52121, 'Vente deja annulee.', 1;
		IF @cancelledByUserId IS NULL OR @cancelledByUserId<=0 THROW 52117, 'cancelledByUserId invalide.', 1;
		SELECT @cancelStatusId=saleStatusId FROM dbo.tblRefSaleStatus WHERE vcCode='CANCELLED';
		IF @cancelStatusId IS NULL THROW 52107, 'Statut CANCELLED absent.', 1;
		UPDATE dbo.tblSale SET saleStatusId=@cancelStatusId,IsCancelled=1,cancelledByUserId=@cancelledByUserId,
			dtCancelledAt=SYSUTCDATETIME(),vcCancellationReason=@vcCancellationReason,
			dtLastUpdated=SYSUTCDATETIME() WHERE saleId=@saleId;

		DECLARE @movementTypeId int;
		SELECT @movementTypeId=stockMovementTypeId FROM dbo.tblRefStockMovementType WHERE vcCode='SALE_CANCEL';
		IF @movementTypeId IS NULL THROW 52108, 'Type de mouvement SALE_CANCEL absent.', 1;
		DECLARE @lines table(rowNumber int IDENTITY(1,1) PRIMARY KEY,productId bigint,stockLotId int NULL,qty decimal(18,3));
		INSERT INTO @lines(productId,stockLotId,qty)
		SELECT productId,stockLotId,dcQuantity FROM dbo.tblSaleDetail WHERE saleId=@saleId;
		DECLARE @i int=1,@n int=(SELECT COUNT(*) FROM @lines),@product bigint,@lot int,@qty decimal(18,3),@before decimal(18,3),@after decimal(18,3);
		WHILE @i<=@n
		BEGIN
			SELECT @product=productId,@lot=stockLotId,@qty=qty FROM @lines WHERE rowNumber=@i;
			MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
			USING (SELECT @storeId AS storeId,@product AS productId) AS source
			ON target.storeId=source.storeId AND target.productId=source.productId
			WHEN NOT MATCHED THEN INSERT(storeId,productId,dcAvailableQuantity,dcReservedQuantity,dtUpdatedAt)
			VALUES(source.storeId,source.productId,0,0,SYSUTCDATETIME());
			SELECT @before=dcAvailableQuantity FROM dbo.tblStoreStock WITH (UPDLOCK,HOLDLOCK) WHERE storeId=@storeId AND productId=@product;
			SET @after=@before+@qty;
			INSERT INTO dbo.tblStockMovement(storeId,productId,stockLotId,stockMovementTypeId,dcQuantity,dcStockBefore,dcStockAfter,vcReferenceType,referenceId,operatedByUserId,dtMovementAt,vcComment)
			VALUES(@storeId,@product,@lot,@movementTypeId,@qty,@before,@after,'SALE_CANCEL',CONVERT(int,@saleId),@cancelledByUserId,SYSUTCDATETIME(),CONCAT('Annulation vente ',@saleNumber));
			UPDATE dbo.tblStoreStock SET dcAvailableQuantity=@after,dtUpdatedAt=SYSUTCDATETIME() WHERE storeId=@storeId AND productId=@product;
			SET @i+=1;
		END;
		COMMIT TRANSACTION;
		SELECT @saleId AS saleId,CAST(1 AS bit) AS cancelled;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CloseCashSession] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_CloseCashSession]
    @cashSessionId INT,
    @cashSessionStatusId INT,
    @mDeclaredClosingAmount MONEY,
    @vcJustification VARCHAR(250) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        -- 1. Vérifier que la session existe et est ouverte
        IF NOT EXISTS (SELECT 1 FROM dbo.tblCashSession WHERE cashSessionId = @cashSessionId AND cashSessionStatusId <> @cashSessionStatusId)
            THROW 50001, 'Session introuvable ou déjà fermée.', 1;

        -- 2. Récupérer le théorique calculé par la vue
        DECLARE @theoreticalBalance MONEY;
        SELECT @theoreticalBalance = mTheoreticalBalance 
        FROM dbo.vw_CashSessionReportTotals 
        WHERE cashSessionId = @cashSessionId;

        IF @theoreticalBalance IS NULL SET @theoreticalBalance = 0;

        -- 3. Vérifier l'écart
        DECLARE @difference MONEY = @mDeclaredClosingAmount - @theoreticalBalance;

        -- Si écart != 0 et pas de justification, on bloque
        IF @difference <> 0 AND (NULLIF(LTRIM(RTRIM(@vcJustification)), '') IS NULL)
            THROW 50002, 'Un écart de caisse a été détecté. Une justification est obligatoire pour clôturer.', 1;

        -- 4. Fermer la session (SANS la colonne vcJustification)
        UPDATE dbo.tblCashSession
        SET cashSessionStatusId = @cashSessionStatusId,
            dtClosedAt = GETDATE(),
            mDeclaredClosingAmount = @mDeclaredClosingAmount
        WHERE cashSessionId = @cashSessionId;

        SELECT @cashSessionId AS cashSessionId, 'Session fermée avec succès.' AS Message;

    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CorrectCashReport] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_CorrectCashReport]
    @cashReportId INT,
    @newAmount MONEY,
    @comment VARCHAR(250),
    @adminUserId INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @theoreticalBalance MONEY;
        SELECT @theoreticalBalance = mTheoreticalBalance FROM dbo.tblCashReport WHERE cashReportId = @cashReportId;

        IF @theoreticalBalance IS NULL
            THROW 53200, 'Rapport de caisse introuvable.', 1;

        -- On récupère l'ID du statut "En attente Admin"
        DECLARE @statusPendingAdminId INT = (
            SELECT cashReportStatusId FROM dbo.tblRefCashReportStatus WHERE vcCode = 'PENDING_ADMIN'
        );

        -- Mise à jour
        UPDATE dbo.tblCashReport
        SET mClosingAmount = @newAmount,
            mDifferenceAmount = @newAmount - @theoreticalBalance,
            vcManagerComment = @comment,
            cashReportStatusId = @statusPendingAdminId, -- ✅ Repasse en attente Admin
            adminApprovedByUserId = NULL, -- ✅ Efface l'ancienne validation
            dtAdminApprovedAt = NULL,
            vcAdminComment = NULL,
            dtLastUpdated = GETDATE()
        WHERE cashReportId = @cashReportId;

        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CountUnreadNotifications] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Nombre de notifications non lues, actives et non expirees. */
CREATE   PROCEDURE [dbo].[sp_CountUnreadNotifications]
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @userId IS NULL OR @userId <= 0
			THROW 52600, 'userId est obligatoire et doit etre positif.', 1;
		SELECT COUNT(1) AS unreadCount
		FROM dbo.tblNotification
		WHERE userId = @userId AND btIsRead = 0 AND btEnabled = 1
		  AND (dtExpiresAt IS NULL OR dtExpiresAt > SYSUTCDATETIME());
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateAdminBySuperAdmin] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  3. PROCÉDURES — CRÉATION AVEC RÔLE
==============================================================================*/

/*------------------------------------------------------------------------------
  3.1 sp_CreateAdminBySuperAdmin
      Réservée au SuperAdmin. Crée un compte Admin rattaché à une entreprise.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_CreateAdminBySuperAdmin]
    @createdByUserId int,
    @companyId       int,
    @vcLastName      varchar(50),
    @vcPasswordHash  varchar(255),
    @vcFirstName     varchar(50) = NULL,
    @genderId        int = NULL,
    @vcEmail         varchar(100) = NULL,
    @vcPhoneNumber   varchar(20) = NULL,
    @vcAddress       varchar(150) = NULL,
    @vcPhotoUrl      varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- 1. Contrôle d'autorisation : l'appelant doit être SuperAdmin --- */
        IF @createdByUserId IS NULL
           OR NOT EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @createdByUserId
                  AND scopeType = 'GLOBAL'
                  AND roleCode = 'SUPER_ADMIN'
           )
            THROW 51260, 'Réservé au SuperAdmin.', 1;

        /* --- 2. Validations métier --- */
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
            THROW 51200, 'Le nom est obligatoire.', 1;

        IF NULLIF(@vcPasswordHash, '') IS NULL
            THROW 51201, 'Le hash est obligatoire.', 1;

        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51202, 'Email ou téléphone obligatoire.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51203, 'Genre introuvable.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblCompany WHERE companyId = @companyId AND btEnabled = 1)
            THROW 51270, 'Entreprise introuvable ou inactive.', 1;

        IF @vcEmail IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail))
            THROW 51271, 'Email déjà utilisé.', 1;

        IF @vcPhoneNumber IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcPhoneNumber = @vcPhoneNumber)
            THROW 51272, 'Téléphone déjà utilisé.', 1;

        DECLARE @adminRoleId int =
            (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'ADMIN' AND btEnabled = 1);
        IF @adminRoleId IS NULL
            THROW 51273, 'Rôle ADMIN introuvable.', 1;

        /* --- 3. Création atomique de l'utilisateur et de son affectation --- */
        BEGIN TRANSACTION;

        DECLARE @newUserId int;

        INSERT INTO dbo.tblUser
            (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
             vcPasswordHash, vcAddress, vcPhotoUrl,
             btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES
            (LTRIM(RTRIM(@vcLastName)),
             NULLIF(LTRIM(RTRIM(@vcFirstName)), ''),
             @genderId,
             LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')),
             NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''),
             @vcPasswordHash,
             NULLIF(LTRIM(RTRIM(@vcAddress)), ''),
             NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''),
             1, SYSUTCDATETIME(), SYSUTCDATETIME());

        SET @newUserId = SCOPE_IDENTITY();

        INSERT INTO dbo.tblUserCompany
            (userId, companyId, roleId, createdByUserId,
             dtAssignedAt, dtEndedAt, btEnabled)
        VALUES
            (@newUserId, @companyId, @adminRoleId, @createdByUserId,
             SYSUTCDATETIME(), NULL, 1);

        COMMIT TRANSACTION;

        SELECT @newUserId AS userId, @companyId AS companyId,
               @adminRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() BETWEEN 50000 AND 59999 THROW;
        THROW 51299, N'sp_CreateAdminBySuperAdmin : échec technique.', 1;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateCashierForManager] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  3.3 sp_CreateCashierForManager
      Ouverte au SuperAdmin, à l'Admin de l'entreprise ou au Manager de la
      boutique. Crée un compte Caissier rattaché à la boutique.
      Un Manager peut créer plusieurs Caissiers.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_CreateCashierForManager]
    @createdByUserId int,
    @storeId         int,
    @vcLastName      varchar(50),
    @vcPasswordHash  varchar(255),
    @genderId        int = NULL,
    @vcFirstName     varchar(50) = NULL,
    @vcEmail         varchar(100) = NULL,
    @vcPhoneNumber   varchar(20) = NULL,
    @vcAddress       varchar(150) = NULL,
    @vcPhotoUrl      varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- Validations métier --- */
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
            THROW 51240, 'Le nom de famille est obligatoire.', 1;

        IF NULLIF(@vcPasswordHash, '') IS NULL
            THROW 51241, 'Le hash du mot de passe est obligatoire.', 1;

        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51242, 'Un email ou un numéro de téléphone est obligatoire.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51243, 'Le genre indiqué est introuvable.', 1;

        DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore
                                   WHERE storeId = @storeId AND btEnabled = 1);
        IF @companyId IS NULL
            THROW 51244, 'Boutique introuvable ou inactive.', 1;

        /* --- Contrôle d'autorisation : SA, Admin de l'entreprise ou Manager --- */
        DECLARE @isSA bit = 0, @isAdmin bit = 0, @isMgr bit = 0;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
            SET @isSA = 1;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'COMPANY'
                     AND companyId = @companyId
                     AND roleCode = 'ADMIN')
            SET @isAdmin = 1;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'STORE'
                     AND storeId = @storeId
                     AND roleCode = 'MANAGER')
            SET @isMgr = 1;

        IF @isSA = 0 AND @isAdmin = 0 AND @isMgr = 0
            THROW 51245, 'Vous n''êtes pas autorisé à créer un caissier dans cette boutique.', 1;

        /* --- Unicité de l'identifiant --- */
        IF @vcEmail IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail))
            THROW 51271, 'Email déjà utilisé.', 1;

        IF @vcPhoneNumber IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcPhoneNumber = @vcPhoneNumber)
            THROW 51272, 'Téléphone déjà utilisé.', 1;

        DECLARE @cashierRoleId int =
            (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'CASHIER' AND btEnabled = 1);
        IF @cashierRoleId IS NULL
            THROW 51246, 'Le rôle CASHIER est introuvable ou inactif.', 1;

        /* --- Création atomique --- */
        BEGIN TRANSACTION;

        DECLARE @newUserId int;

        INSERT INTO dbo.tblUser
            (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
             vcPasswordHash, vcAddress, vcPhotoUrl,
             btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES
            (LTRIM(RTRIM(@vcLastName)),
             NULLIF(LTRIM(RTRIM(@vcFirstName)), ''),
             @genderId,
             LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')),
             NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''),
             @vcPasswordHash,
             NULLIF(LTRIM(RTRIM(@vcAddress)), ''),
             NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''),
             1, SYSUTCDATETIME(), SYSUTCDATETIME());

        SET @newUserId = SCOPE_IDENTITY();

        INSERT INTO dbo.tblUserStore
            (userId, storeId, roleId, assignedByUserId,
             dtStartDate, dtEndDate, btEnabled)
        VALUES
            (@newUserId, @storeId, @cashierRoleId, @createdByUserId,
             SYSUTCDATETIME(), NULL, 1);

        COMMIT TRANSACTION;

        SELECT @newUserId AS userId, @storeId AS storeId,
               @cashierRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() BETWEEN 50000 AND 59999 THROW;
        THROW 51299, N'sp_CreateCashierForManager : échec technique.', 1;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateCashRegister] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree une caisse active. */
CREATE   PROCEDURE [dbo].[sp_CreateCashRegister]
	@storeId int,
	@vcRegisterCode varchar(20),
	@vcRegisterName varchar(50)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 53100, 'storeId invalide.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcRegisterCode)), '') IS NULL THROW 53101, 'vcRegisterCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcRegisterName)), '') IS NULL THROW 53102, 'vcRegisterName est obligatoire.', 1;
		INSERT INTO dbo.tblCashRegister(storeId,vcRegisterCode,vcRegisterName,btEnabled)
		OUTPUT INSERTED.cashRegisterId,INSERTED.storeId,INSERTED.vcRegisterCode,INSERTED.vcRegisterName
		VALUES(@storeId,LTRIM(RTRIM(@vcRegisterCode)),LTRIM(RTRIM(@vcRegisterName)),1);
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateCashReport] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE PROCEDURE [dbo].[sp_CreateCashReport]
    @cashSessionId INT,
    @mDeclaredClosingAmount MONEY,
    @vcManagerComment NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Récupérer les infos de la session
        DECLARE @mOpeningCaisse MONEY;
        DECLARE @userId INT;

        SELECT @mOpeningCaisse = mOpeningCaisse, @userId = userId
        FROM dbo.tblCashSession
        WHERE cashSessionId = @cashSessionId;

        IF @mOpeningCaisse IS NULL
            THROW 50010, 'Session de caisse introuvable.', 1;

        -- 2. Calculer les totaux de la session
        DECLARE @mTotalSales MONEY = 0;
        DECLARE @mTotalCash MONEY = 0;
        DECLARE @mTotalMobileMoney MONEY = 0;
        DECLARE @mTotalCredit MONEY = 0;
        DECLARE @mTotalRecoveries MONEY = 0;
        DECLARE @mTotalExpenses MONEY = 0;
        DECLARE @mTheoreticalBalance MONEY = 0;
        DECLARE @mDifferenceAmount MONEY = 0;
        DECLARE @cashReportStatusId INT;

        -- ✅ On force l'ID 2 (PENDING_ADMIN) directement
        SET @cashReportStatusId = 2;

        -- Ventes (Total et Crédit)
        -- ✅ On utilise l'alias s et les crochets [IsCancelled]
        SELECT 
            @mTotalSales = COALESCE(SUM(s.mNetAmount), 0),
            @mTotalCredit = COALESCE(SUM(s.mDebtAmount), 0)
        FROM dbo.tblSale s
        WHERE s.cashSessionId = @cashSessionId AND s.[IsCancelled] = 0;

        -- Ventes en espèces et Mobile Money
        -- ✅ On utilise les alias sp, s, pm, ps et les crochets [IsCancelled]
        SELECT 
            @mTotalCash = COALESCE(SUM(CASE WHEN pm.vcCode = 'CASH' THEN sp.mAmount ELSE 0 END), 0),
            @mTotalMobileMoney = COALESCE(SUM(CASE WHEN pm.vcCode IN ('ORANGE_MONEY', 'MTN_MOMO', 'CARD', 'BANK_TRANSFER') THEN sp.mAmount ELSE 0 END), 0)
        FROM dbo.tblSalePayment sp
        INNER JOIN dbo.tblSale s ON s.saleId = sp.saleId
        INNER JOIN dbo.tblRefPaymentMethod pm ON pm.paymentMethodId = sp.paymentMethodId
        INNER JOIN dbo.tblRefPaymentStatus ps ON ps.paymentStatusId = sp.paymentStatusId
        WHERE s.cashSessionId = @cashSessionId AND s.[IsCancelled] = 0;

        -- Recouvrements de dettes (Cash)
        SELECT @mTotalRecoveries = COALESCE(SUM(dp.mAmount), 0)
        FROM dbo.tblDebtPayment dp
        INNER JOIN dbo.tblRefPaymentMethod pm ON pm.paymentMethodId = dp.paymentMethodId
        INNER JOIN dbo.tblRefPaymentStatus ps ON ps.paymentStatusId = dp.paymentStatusId
        WHERE dp.cashSessionId = @cashSessionId;

        -- Dépenses
        SELECT @mTotalExpenses = COALESCE(SUM(e.mAmount), 0)
        FROM dbo.tblExpense e
        WHERE e.cashSessionId = @cashSessionId AND e.vcStatusCode = 'APPROVED';

        -- 3. Calculs finaux
        SET @mTheoreticalBalance = @mOpeningCaisse + @mTotalCash + @mTotalRecoveries - @mTotalExpenses;
        SET @mDifferenceAmount = @mDeclaredClosingAmount - @mTheoreticalBalance;

        -- 4. Insertion du rapport
        INSERT INTO dbo.tblCashReport (
            cashSessionId, cashReportStatusId,
            mOpeningCashReport, mTotalSales, mTotalCash, 
            mTotalMobileMoney, mTotalCredit, mTotalRecoveries, mTotalApprovedExpenses,
            mTheoreticalBalance, mClosingAmount, mDifferenceAmount,
            managerApprovedByUserId, vcManagerComment
        )
        OUTPUT INSERTED.*
        VALUES (
            @cashSessionId, @cashReportStatusId,
            @mOpeningCaisse, @mTotalSales, @mTotalCash,
            @mTotalMobileMoney, @mTotalCredit, @mTotalRecoveries, @mTotalExpenses,
            @mTheoreticalBalance, @mDeclaredClosingAmount, @mDifferenceAmount,
            @userId, @vcManagerComment
        );

    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree une entreprise active. */
CREATE   PROCEDURE [dbo].[sp_CreateCompany]
	@vcCompanyCode varchar(20),
	@vcCompanyName varchar(50),
	@vcRccm varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcEmail nvarchar(100) = NULL,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL,
	@vcLogoUrl varchar(255) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcCompanyCode)), '') IS NULL
			THROW 53000, 'vcCompanyCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcCompanyName)), '') IS NULL
			THROW 53001, 'vcCompanyName est obligatoire.', 1;

		INSERT INTO dbo.tblCompany (
			vcCompanyCode, vcCompanyName, vcRccm, vcPhoneNumber, vcEmail,
			vcAddress, vcCity, vcLogoUrl, btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT
			INSERTED.companyId, INSERTED.vcCompanyCode, INSERTED.vcCompanyName,
			INSERTED.vcRccm, INSERTED.vcPhoneNumber, INSERTED.vcEmail,
			INSERTED.vcAddress, INSERTED.vcCity, INSERTED.vcLogoUrl,
			INSERTED.btEnabled, INSERTED.dtCreatedAt
		VALUES (
			LTRIM(RTRIM(@vcCompanyCode)), LTRIM(RTRIM(@vcCompanyName)),
			@vcRccm, @vcPhoneNumber, @vcEmail, @vcAddress, @vcCity,
			@vcLogoUrl, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateCustomer] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_CreateCustomer]
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
			THROW 51101, 'companyId est obligatoire et doit etre positif.', 1;
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
/****** Objet : StoredProcedure [dbo].[sp_CreateDebtPayment] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree le paiement et le mouvement tiers, puis met a jour le solde atomiquement. */
CREATE   PROCEDURE [dbo].[sp_CreateDebtPayment]
	@thirdPartyAccountId int,
	@storeId int = NULL,
	@cashSessionId int = NULL,
	@paymentMethodId int,
	@paymentStatusId int,
	@mAmount money,
	@vcTransactionId varchar(150) = NULL,
	@vcOperatorReference varchar(150) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@operatedByUserId int,
	@vcNote varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @thirdPartyAccountId IS NULL OR @thirdPartyAccountId <= 0
			THROW 52900, 'thirdPartyAccountId est obligatoire et doit etre positif.', 1;
		IF @paymentMethodId IS NULL OR @paymentMethodId <= 0
			THROW 52901, 'paymentMethodId est obligatoire.', 1;
		IF @paymentStatusId IS NULL OR @paymentStatusId <= 0
			THROW 52902, 'paymentStatusId est obligatoire.', 1;
		IF @mAmount IS NULL OR @mAmount <= 0
			THROW 52903, 'mAmount doit etre strictement superieur a zero.', 1;
		IF @operatedByUserId IS NULL OR @operatedByUserId <= 0
			THROW 52904, 'operatedByUserId est obligatoire.', 1;

		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefPaymentMethod WHERE paymentMethodId = @paymentMethodId)
			THROW 52901, 'Methode de paiement introuvable.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefPaymentStatus WHERE paymentStatusId = @paymentStatusId)
			THROW 52902, 'Statut de paiement introuvable.', 1;

		DECLARE @startedTransaction bit = 0;
		IF @@TRANCOUNT = 0
		BEGIN
			BEGIN TRANSACTION;
			SET @startedTransaction = 1;
		END
		ELSE
			SAVE TRANSACTION DebtPaymentSave;

		DECLARE @customerId int, @supplierId int, @balanceBefore money;
		SELECT @customerId = customerId, @supplierId = supplierId,
			@balanceBefore = dcCurrentBalance
		FROM dbo.tblThirdPartyAccount WITH (UPDLOCK, HOLDLOCK)
		WHERE thirdPartyAccountId = @thirdPartyAccountId;
		IF @balanceBefore IS NULL
			THROW 52905, 'Compte tiers introuvable.', 1;
		IF (@customerId IS NULL AND @supplierId IS NULL)
			OR (@customerId IS NOT NULL AND @supplierId IS NOT NULL)
			THROW 52906, 'Le compte tiers doit etre rattache a exactement un client ou fournisseur.', 1;

		DECLARE @movementCode varchar(50) = CASE
			WHEN @customerId IS NOT NULL THEN 'CUSTOMER_PAYMENT'
			ELSE 'SUPPLIER_PAYMENT' END;
		DECLARE @movementTypeId int, @direction smallint;
		SELECT @movementTypeId = thirdPartyMovementTypeId, @direction = direction
		FROM dbo.tblRefThirdPartyMovementType
		WHERE vcCode = @movementCode;
		IF @movementTypeId IS NULL OR @direction IS NULL OR @direction NOT IN (-1, 1)
			THROW 52907, 'Type de mouvement de paiement tiers absent ou direction invalide.', 1;

		DECLARE @payment table (debtPaymentId int);
		INSERT INTO dbo.tblDebtPayment (
			thirdPartyAccountId, storeId, cashSessionId, paymentMethodId, paymentStatusId,
			mAmount, vcTransactionId, vcOperatorReference, vcPhoneNumber, vcCallbackPayload,
			OperatedByUserId, vcNote, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.debtPaymentId INTO @payment(debtPaymentId)
		VALUES (
			@thirdPartyAccountId, @storeId, @cashSessionId, @paymentMethodId, @paymentStatusId,
			@mAmount, @vcTransactionId, @vcOperatorReference, @vcPhoneNumber, NULL,
			@operatedByUserId, @vcNote, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		DECLARE @debtPaymentId int = (SELECT debtPaymentId FROM @payment);
		DECLARE @balanceAfter money = @balanceBefore + (@direction * @mAmount);
		INSERT INTO dbo.tblThirdPartyAccountMovement (
			thirdPartyAccountId, thirdPartyMovementTypeId, saleId, purchaseId, debtPaymentId,
			storeId, mAmount, mBalanceBefore, mBalanceAfter, operatedByUserId,
			Note, dtCreatedAt, dtLastUpdated
		)
		VALUES (
			@thirdPartyAccountId, @movementTypeId, NULL, NULL, @debtPaymentId,
			@storeId, @mAmount, @balanceBefore, @balanceAfter, @operatedByUserId,
			@vcNote, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		UPDATE dbo.tblThirdPartyAccount
		SET dcCurrentBalance = @balanceAfter,
			dtLastMovementAt = SYSUTCDATETIME(),
			dtLastUpdated = SYSUTCDATETIME()
		WHERE thirdPartyAccountId = @thirdPartyAccountId;

		IF @startedTransaction = 1 COMMIT TRANSACTION;
		SELECT @debtPaymentId AS debtPaymentId, @balanceAfter AS nouveauSolde;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0
		BEGIN
			IF @startedTransaction = 1 ROLLBACK TRANSACTION;
			ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION DebtPaymentSave;
		END;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateExpense] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree une depense avec le statut fourni par le DAL (PENDING par defaut). */
CREATE   PROCEDURE [dbo].[sp_CreateExpense]
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
/****** Objet : StoredProcedure [dbo].[sp_CreateExpenseCategory] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree une categorie de depenses active. */
CREATE   PROCEDURE [dbo].[sp_CreateExpenseCategory]
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
/****** Objet : StoredProcedure [dbo].[sp_CreateInventory] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Ouvre un inventaire OPEN et insere ses lignes de comptage en une transaction. */
CREATE   PROCEDURE [dbo].[sp_CreateInventory]
	@vcInventoryNumber varchar(30),
	@storeId int,
	@inventoryStatusId int,
	@createdByUserId int,
	@details dbo.InventoryDetailCreateType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcInventoryNumber)), '') IS NULL
			THROW 52700, 'vcInventoryNumber est obligatoire.', 1;
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52701, 'storeId est obligatoire et doit etre positif.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52702, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefInventoryStatus WHERE inventoryStatusId=@inventoryStatusId AND vcCode='OPEN')
			THROW 52703, 'Le statut initial doit etre OPEN.', 1;
		IF EXISTS (SELECT 1 FROM @details WHERE productId<=0 OR dcTheoreticalQuantity<0 OR dcPhysicalQuantity<0)
			THROW 52704, 'Les produits doivent etre valides et les quantites >= 0.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table(inventoryId int,vcInventoryNumber varchar(30));
		INSERT INTO dbo.tblInventory(
			vcInventoryNumber,storeId,inventoryStatusId,dtStartedAt,dtEndedAt,createdByUserId,approvedByUserId
		)
		OUTPUT INSERTED.inventoryId,INSERTED.vcInventoryNumber INTO @created(inventoryId,vcInventoryNumber)
		VALUES(LTRIM(RTRIM(@vcInventoryNumber)),@storeId,@inventoryStatusId,SYSUTCDATETIME(),NULL,@createdByUserId,NULL);
		DECLARE @inventoryId int=(SELECT inventoryId FROM @created);
		INSERT INTO dbo.tblInventoryDetail(inventoryId,productId,dcTheoreticalQuantity,dcPhysicalQuantity,vcComment)
		SELECT @inventoryId,productId,dcTheoreticalQuantity,dcPhysicalQuantity,vcComment FROM @details;
		COMMIT TRANSACTION;
		SELECT inventoryId,vcInventoryNumber FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateManagerByAdmin] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  3.2 sp_CreateManagerByAdmin
      Ouverte au SuperAdmin ou à l'Admin de l'entreprise cible.
      Crée un compte Manager rattaché à une boutique.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_CreateManagerByAdmin]
    @createdByUserId int,
    @storeId         int,
    @vcLastName      varchar(50),
    @vcPasswordHash  varchar(255),
    @vcFirstName     varchar(50) = NULL,
    @genderId        int = NULL,
    @vcEmail         varchar(100) = NULL,
    @vcPhoneNumber   varchar(20) = NULL,
    @vcAddress       varchar(150) = NULL,
    @vcPhotoUrl      varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- Validations métier --- */
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
            THROW 51200, 'Le nom est obligatoire.', 1;

        IF NULLIF(@vcPasswordHash, '') IS NULL
            THROW 51201, 'Le hash est obligatoire.', 1;

        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51202, 'Email ou téléphone obligatoire.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51203, 'Genre introuvable.', 1;

        DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore
                                   WHERE storeId = @storeId AND btEnabled = 1);
        IF @companyId IS NULL
            THROW 51274, 'Boutique introuvable ou inactive.', 1;

        /* --- Contrôle d'autorisation : SuperAdmin ou Admin de l'entreprise --- */
        DECLARE @isSA bit = 0, @isAdmin bit = 0;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
            SET @isSA = 1;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'COMPANY'
                     AND companyId = @companyId
                     AND roleCode = 'ADMIN')
            SET @isAdmin = 1;

        IF @isSA = 0 AND @isAdmin = 0
            THROW 51275, 'Seul un SuperAdmin ou un Admin de cette entreprise peut créer un Manager.', 1;

        /* --- Unicité de l'identifiant --- */
        IF @vcEmail IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail))
            THROW 51271, 'Email déjà utilisé.', 1;

        IF @vcPhoneNumber IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcPhoneNumber = @vcPhoneNumber)
            THROW 51272, 'Téléphone déjà utilisé.', 1;

        DECLARE @managerRoleId int =
            (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'MANAGER' AND btEnabled = 1);
        IF @managerRoleId IS NULL
            THROW 51276, 'Rôle MANAGER introuvable.', 1;

        /* --- Création atomique --- */
        BEGIN TRANSACTION;

        DECLARE @newUserId int;

        INSERT INTO dbo.tblUser
            (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
             vcPasswordHash, vcAddress, vcPhotoUrl,
             btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES
            (LTRIM(RTRIM(@vcLastName)),
             NULLIF(LTRIM(RTRIM(@vcFirstName)), ''),
             @genderId,
             LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')),
             NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''),
             @vcPasswordHash,
             NULLIF(LTRIM(RTRIM(@vcAddress)), ''),
             NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''),
             1, SYSUTCDATETIME(), SYSUTCDATETIME());

        SET @newUserId = SCOPE_IDENTITY();

        INSERT INTO dbo.tblUserStore
            (userId, storeId, roleId, assignedByUserId,
             dtStartDate, dtEndDate, btEnabled)
        VALUES
            (@newUserId, @storeId, @managerRoleId, @createdByUserId,
             SYSUTCDATETIME(), NULL, 1);

        COMMIT TRANSACTION;

        SELECT @newUserId AS userId, @storeId AS storeId,
               @managerRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() BETWEEN 50000 AND 59999 THROW;
        THROW 51299, N'sp_CreateManagerByAdmin : échec technique.', 1;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateNotification] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree une notification non lue et retour les champs attendus par le DAL. */
CREATE   PROCEDURE [dbo].[sp_CreateNotification]
	@userId int,
	@companyId int = NULL,
	@storeId int = NULL,
	@notificationTypeId int = NULL,
	@vcTitle varchar(100),
	@vcMessage varchar(500),
	@vcPriority varchar(20) = 'NORMAL',
	@vcReferenceType varchar(50) = NULL,
	@referenceId bigint = NULL,
	@vcActionUrl varchar(255) = NULL,
	@dtExpiresAt datetime2 = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @userId IS NULL OR @userId <= 0
			THROW 52600, 'userId est obligatoire et doit etre positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcTitle)), '') IS NULL
			THROW 52601, 'vcTitle est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcMessage)), '') IS NULL
			THROW 52602, 'vcMessage est obligatoire.', 1;
		IF @notificationTypeId IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM dbo.tblRefNotificationType WHERE notificationTypeId = @notificationTypeId
		)
			THROW 52603, 'notificationTypeId introuvable.', 1;

		INSERT INTO dbo.tblNotification (
			userId, companyId, storeId, notificationTypeId, vcTitle, vcMessage,
			vcPriority, vcReferenceType, referenceId, vcActionUrl,
			btIsRead, dtReadAt, dtExpiresAt, btEnabled, dtCreatedAt
		)
		OUTPUT INSERTED.notificationId, INSERTED.userId, INSERTED.vcTitle,
		       INSERTED.btIsRead, INSERTED.dtCreatedAt
		VALUES (
			@userId, @companyId, @storeId, @notificationTypeId,
			LTRIM(RTRIM(@vcTitle)), LTRIM(RTRIM(@vcMessage)), @vcPriority,
			@vcReferenceType, @referenceId, @vcActionUrl,
			0, NULL, @dtExpiresAt, 1, SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateProduct] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_CreateProduct]
    @companyId INT,
    @productCategoryId INT = NULL,
    @unitOfMeasureId INT = NULL,
    @vcProductCode VARCHAR(20),
    @vcProductName VARCHAR(50),
    @vcDescription VARCHAR(150) = NULL,
    @vcBarcode VARCHAR(100) = NULL,
    @vcImageUrl VARCHAR(MAX) = NULL,
    @dcDefaultAlertThreshold DECIMAL(18,3) = 0,
    @createdByUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- Validations de base
        IF NULLIF(LTRIM(RTRIM(@vcProductCode)), '') IS NULL
            THROW 52500, 'Le code produit (vcProductCode) est obligatoire.', 1;
        IF NULLIF(LTRIM(RTRIM(@vcProductName)), '') IS NULL
            THROW 52501, 'Le nom du produit (vcProductName) est obligatoire.', 1;
        IF @companyId IS NULL OR @companyId <= 0
            THROW 52502, 'companyId est obligatoire.', 1;

        -- ✅ GESTION DU DOUBLON DE CODE
        -- Si le produit existe déjà avec ce code, on le retourne au lieu de planter
        IF EXISTS (SELECT 1 FROM dbo.tblProduct WHERE companyId = @companyId AND vcProductCode = LTRIM(RTRIM(@vcProductCode)))
        BEGIN
            SELECT 
                productId, companyId, productCategoryId, unitOfMeasureId, 
                vcProductCode, vcProductName, vcBarcode, vcImageUrl, 
                dcDefaultAlertThreshold, btEnabled, dtCreatedAt
            FROM dbo.tblProduct 
            WHERE companyId = @companyId AND vcProductCode = LTRIM(RTRIM(@vcProductCode));
            RETURN;
        END

        -- GESTION DE LA CATÉGORIE PAR DÉFAUT
        IF @productCategoryId IS NULL OR @productCategoryId <= 0
        BEGIN
            SELECT TOP 1 @productCategoryId = productCategoryId 
            FROM dbo.tblProductCategory 
            WHERE companyId = @companyId AND vcCategoryCode = 'DIVERS';

            IF @productCategoryId IS NULL
            BEGIN
                INSERT INTO dbo.tblProductCategory (companyId, vcCategoryCode, vcCategoryName, vcDescription, btEnabled, dtCreatedAt, dtLastUpdated)
                VALUES (@companyId, 'DIVERS', 'Divers', 'Catégorie par défaut générée automatiquement', 1, GETDATE(), GETDATE());
                
                SET @productCategoryId = SCOPE_IDENTITY();
            END
        END
        ELSE
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.tblProductCategory WHERE productCategoryId = @productCategoryId AND companyId = @companyId)
                THROW 52504, 'La catégorie spécifiée n''appartient pas à cette entreprise.', 1;
        END

        -- Insertion du produit
        INSERT INTO dbo.tblProduct (
            companyId, productCategoryId, unitOfMeasureId, 
            vcProductCode, vcProductName, vcDescription, vcBarcode, vcImageUrl, 
            dcDefaultAlertThreshold, createdByUserId, btEnabled, dtCreatedAt, dtLastUpdated
        )
        VALUES (
            @companyId, @productCategoryId, @unitOfMeasureId,
            LTRIM(RTRIM(@vcProductCode)), LTRIM(RTRIM(@vcProductName)), @vcDescription, @vcBarcode, @vcImageUrl,
            @dcDefaultAlertThreshold, @createdByUserId, 1, GETDATE(), GETDATE()
        );

        -- Retourner le produit créé
        SELECT 
            productId, companyId, productCategoryId, unitOfMeasureId, 
            vcProductCode, vcProductName, vcBarcode, vcImageUrl, 
            dcDefaultAlertThreshold, btEnabled, dtCreatedAt
        FROM dbo.tblProduct 
        WHERE productId = SCOPE_IDENTITY();

    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreatePromotion] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree une promotion et ses produits/boutiques dans une transaction unique. */
CREATE   PROCEDURE [dbo].[sp_CreatePromotion]
	@companyId int,
	@vcPromotionName varchar(50),
	@discountTypeId int,
	@dcDiscountValue decimal(18, 2),
	@dtStartDate datetime,
	@dtEndDate datetime,
	@createdByUserId int,
	@productIds dbo.PromotionProductIdList READONLY,
	@storeIds dbo.PromotionStoreIdList READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 52400, 'companyId est obligatoire et doit etre positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcPromotionName)), '') IS NULL
			THROW 52401, 'vcPromotionName est obligatoire.', 1;
		IF @dcDiscountValue IS NULL OR @dcDiscountValue < 0
			THROW 52402, 'dcDiscountValue doit etre positif ou nul.', 1;
		IF @dtStartDate IS NULL OR @dtEndDate IS NULL OR @dtEndDate < @dtStartDate
			THROW 52403, 'Les dates de promotion sont invalides (fin >= debut requise).', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52404, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefDiscountType WHERE discountTypeId = @discountTypeId)
			THROW 52405, 'Type de remise introuvable.', 1;
		IF EXISTS (
			SELECT 1 FROM @productIds AS ids
			LEFT JOIN dbo.tblProduct AS p ON p.productId = ids.productId
			WHERE p.productId IS NULL OR p.companyId <> @companyId
		)
			THROW 52406, 'Un ou plusieurs produits sont absents ou hors entreprise.', 1;
		IF EXISTS (
			SELECT 1 FROM @storeIds AS ids
			LEFT JOIN dbo.tblStore AS s ON s.storeId = ids.storeId
			WHERE s.storeId IS NULL OR s.companyId <> @companyId
		)
			THROW 52407, 'Une ou plusieurs boutiques sont absentes ou hors entreprise.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (promotionId int);
		INSERT INTO dbo.tblPromotion (
			companyId, vcPromotionName, discountTypeId, dcDiscountValue,
			dtStartDate, dtEndDate, createdByUserId, btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.promotionId INTO @created(promotionId)
		VALUES (
			@companyId, LTRIM(RTRIM(@vcPromotionName)), @discountTypeId, @dcDiscountValue,
			@dtStartDate, @dtEndDate, @createdByUserId, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		DECLARE @promotionId int = (SELECT promotionId FROM @created);
		INSERT INTO dbo.tblPromotionProduct(promotionId, productId)
		SELECT @promotionId, productId FROM @productIds;
		INSERT INTO dbo.tblPromotionStore(promotionId, storeId)
		SELECT @promotionId, storeId FROM @storeIds;
		COMMIT TRANSACTION;
		SELECT promotionId FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreatePurchase] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree un achat DRAFT et ses details dans une transaction unique. */
CREATE   PROCEDURE [dbo].[sp_CreatePurchase]
	@vcPurchaseNumber varchar(30),
	@supplierId int,
	@storeId int,
	@purchaseStatusId int,
	@dtOrderAt datetime2,
	@createdByUserId int,
	@details dbo.PurchaseDetailInputType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcPurchaseNumber)), '') IS NULL
			THROW 52300, 'vcPurchaseNumber est obligatoire.', 1;
		IF @supplierId IS NULL OR @supplierId <= 0 OR @storeId IS NULL OR @storeId <= 0
			THROW 52301, 'supplierId et storeId doivent etre positifs.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52302, 'createdByUserId doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM @details)
			THROW 52303, 'Au moins une ligne de detail est requise.', 1;
		IF EXISTS (SELECT 1 FROM @details WHERE productId <= 0 OR dcOrderedQuantity <= 0 OR mUnitPurchasePrice < 0)
			THROW 52304, 'Chaque ligne exige un produit, une quantite positive et un prix positif ou nul.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (purchaseId int, vcPurchaseNumber varchar(30), mTotalAmount money);
		INSERT INTO dbo.tblPurchase (
			vcPurchaseNumber, supplierId, storeId, purchaseStatusId,
			dtOrderAt, dtReceivedAt, mTotalAmount, createdByUserId, receivedByUserId,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.purchaseId, INSERTED.vcPurchaseNumber, INSERTED.mTotalAmount
			INTO @created (purchaseId, vcPurchaseNumber, mTotalAmount)
		VALUES (
			LTRIM(RTRIM(@vcPurchaseNumber)), @supplierId, @storeId, @purchaseStatusId,
			COALESCE(@dtOrderAt, SYSUTCDATETIME()), NULL, 0, @createdByUserId, NULL,
			1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
		DECLARE @purchaseId int = (SELECT purchaseId FROM @created);
		INSERT INTO dbo.tblPurchaseDetail (
			purchaseId, productId, dcOrderedQuantity, dcReceivedQuantity,
			mUnitPurchasePrice, vcLotNumber, dtExpirationAt
		)
		SELECT @purchaseId, productId, dcOrderedQuantity, 0,
			mUnitPurchasePrice, vcLotNumber, dtExpirationAt
		FROM @details;
		COMMIT TRANSACTION;
		SELECT purchaseId, vcPurchaseNumber, mTotalAmount FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateSale] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*
  Creation atomique de l'entete, des details, des paiements et des mouvements.
  Les totaux sont calcules par Node comme dans SaleDAL.create.
*/
CREATE   PROCEDURE [dbo].[sp_CreateSale]
	@vcSaleNumber varchar(20),
	@companyId int,
	@storeId int,
	@cashSessionId int,
	@sellerUserId int,
	@saleStatusId int,
	@mGrossAmount money,
	@mDiscountAmount money,
	@mNetAmount money,
	@mPaidAmount money,
	@mDebtAmount money,
	@details dbo.SaleDetailInputType READONLY,
	@payments dbo.SalePaymentInputType READONLY,
	@customerId int = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcSaleNumber)), '') IS NULL
			THROW 52100, 'vcSaleNumber est obligatoire.', 1;
		IF @companyId IS NULL OR @companyId <= 0 OR @storeId IS NULL OR @storeId <= 0
			THROW 52101, 'companyId et storeId doivent etre positifs.', 1;
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 OR @sellerUserId IS NULL OR @sellerUserId <= 0
			THROW 52102, 'cashSessionId et sellerUserId sont obligatoires.', 1;
		IF NOT EXISTS (SELECT 1 FROM @details)
			THROW 52103, 'Au moins une ligne de vente est requise.', 1;
		IF EXISTS (SELECT 1 FROM @details WHERE productId <= 0 OR dcQuantity <= 0 OR mUnitSalePrice < 0 OR mDiscountAmount < 0)
			THROW 52104, 'Ligne de vente invalide.', 1;
		IF @mNetAmount < 0 OR @mPaidAmount < 0 OR @mDebtAmount < 0 OR @mPaidAmount + @mDebtAmount <> @mNetAmount
			THROW 52105, 'Les montants doivent respecter mPaidAmount + mDebtAmount = mNetAmount.', 1;
		IF @mDebtAmount > 0 AND @customerId IS NULL
			THROW 52106, 'Une vente a credit exige un customerId.', 1;

		DECLARE @statusCode varchar(50);
		SELECT @statusCode = vcCode FROM dbo.tblRefSaleStatus WHERE saleStatusId = @saleStatusId;
		IF @statusCode IS NULL THROW 52107, 'Statut de vente introuvable.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (saleId bigint, vcSaleNumber varchar(20), mNetAmount money);
		INSERT INTO dbo.tblSale (
			vcSaleNumber, companyId, storeId, cashSessionId, customerId, sellerUserId,
			saleStatusId, mGrossAmount, mDiscountAmount, mNetAmount, mPaidAmount, mDebtAmount,
			dtSoldAt, IsCancelled, cancelledByUserId, dtCancelledAt, vcCancellationReason,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.saleId, INSERTED.vcSaleNumber, INSERTED.mNetAmount
			INTO @created (saleId, vcSaleNumber, mNetAmount)
		VALUES (
			@vcSaleNumber, @companyId, @storeId, @cashSessionId, @customerId, @sellerUserId,
			@saleStatusId, @mGrossAmount, @mDiscountAmount, @mNetAmount, @mPaidAmount, @mDebtAmount,
			SYSUTCDATETIME(), 0, NULL, NULL, NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		DECLARE @saleId bigint = (SELECT saleId FROM @created);
		INSERT INTO dbo.tblSaleDetail (
			saleId, productId, stockLotId, dcQuantity, mUnitPurchasePrice,
			mUnitSalePrice, mDiscountAmount, mLineAmount
		)
		SELECT @saleId, productId, stockLotId, dcQuantity, mUnitPurchasePrice,
			mUnitSalePrice, mDiscountAmount,
			CONVERT(decimal(18, 2), dcQuantity * mUnitSalePrice - mDiscountAmount)
		FROM @details;

		INSERT INTO dbo.tblSalePayment (
			saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			vcCallbackPayload, OperatorMessage, dtCreatedAt, dtLastUpdated
		)
		SELECT @saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
		FROM @payments;

		IF @statusCode <> 'DRAFT'
		BEGIN
			DECLARE @saleLines table (
				rowNumber int IDENTITY(1,1) PRIMARY KEY,
				productId bigint,
				stockLotId int NULL,
				dcQuantity decimal(18,3)
			);
			INSERT INTO @saleLines (productId, stockLotId, dcQuantity)
			SELECT productId, stockLotId, dcQuantity FROM @details;

			DECLARE @row int = 1, @rowCount int = (SELECT COUNT(*) FROM @saleLines);
			DECLARE @productId bigint, @stockLotId int, @qty decimal(18,3);
			DECLARE @stockBefore decimal(18,3), @stockAfter decimal(18,3), @movementTypeId int;
			SELECT @movementTypeId = stockMovementTypeId
			FROM dbo.tblRefStockMovementType WHERE vcCode = 'SALE';
			IF @movementTypeId IS NULL THROW 52108, 'Type de mouvement SALE absent.', 1;

			WHILE @row <= @rowCount
			BEGIN
				SELECT @productId = productId, @stockLotId = stockLotId, @qty = dcQuantity
				FROM @saleLines WHERE rowNumber = @row;
				MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
				USING (SELECT @storeId AS storeId, @productId AS productId) AS source
					ON target.storeId = source.storeId AND target.productId = source.productId
				WHEN NOT MATCHED THEN
					INSERT (storeId, productId, dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt)
					VALUES (source.storeId, source.productId, 0, 0, SYSUTCDATETIME());
				SELECT @stockBefore = dcAvailableQuantity
				FROM dbo.tblStoreStock WITH (UPDLOCK, HOLDLOCK)
				WHERE storeId = @storeId AND productId = @productId;
				SET @stockAfter = @stockBefore - @qty;
				IF @stockAfter < 0 THROW 52109, 'Stock insuffisant pour valider la vente.', 1;
				INSERT INTO dbo.tblStockMovement (
					storeId, productId, stockLotId, stockMovementTypeId,
					dcQuantity, dcStockBefore, dcStockAfter, vcReferenceType,
					referenceId, operatedByUserId, dtMovementAt, vcComment
				)
				VALUES (@storeId, @productId, @stockLotId, @movementTypeId,
					-@qty, @stockBefore, @stockAfter, 'SALE', CONVERT(int, @saleId),
					@sellerUserId, SYSUTCDATETIME(), CONCAT('Vente ', @vcSaleNumber));
				UPDATE dbo.tblStoreStock
				SET dcAvailableQuantity = @stockAfter, dtUpdatedAt = SYSUTCDATETIME()
				WHERE storeId = @storeId AND productId = @productId;
				SET @row += 1;
			END;
		END;

		COMMIT TRANSACTION;
		SELECT saleId, vcSaleNumber, mNetAmount FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateStockAdjustment] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_CreateStockAdjustment]
    @storeId int,
    @adjustmentReasonId int,
    @adjustmentStatusId int,
    @vcJustification varchar(150),
    @vcProofImageUrl varchar(MAX) = NULL,
    @createdByUserId int,
    @details dbo.StockAdjustmentDetailCreateType READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Vérifications de base
        IF NOT EXISTS (SELECT 1 FROM tblStore WHERE storeId = @storeId)
            THROW 52000, 'Boutique introuvable.', 1;
        
        IF NOT EXISTS (SELECT 1 FROM tblRefAdjustmentReason WHERE adjustmentReasonId = @adjustmentReasonId)
            THROW 52001, 'Motif d''ajustement invalide.', 1;

        -- 2. Insertion de l'entête (Header)
        DECLARE @newAdjustmentId INT;
        
        INSERT INTO tblStockAdjustment (
            storeId, adjustmentReasonId, adjustmentStatusId, 
            vcJustification, vcProofImageUrl, createdByUserId, dtCreatedAt
        )
        VALUES (
            @storeId, @adjustmentReasonId, @adjustmentStatusId, 
            @vcJustification, @vcProofImageUrl, @createdByUserId, GETUTCDATE()
        );

        SET @newAdjustmentId = SCOPE_IDENTITY();

        -- 3. Insertion des détails (Lignes) AVEC LE CALCUL DE dcQuantityAfter
        INSERT INTO tblStockAdjustmentDetail (
            stockAdjustmentId, 
            productId, 
            stockLotId, 
            dcQuantityBefore, 
            dcAdjustmentQuantity,
            dcQuantityAfter -- 🟢 AJOUTÉ ICI
        )
        SELECT 
            @newAdjustmentId, 
            productId, 
            stockLotId, 
            dcQuantityBefore, 
            dcAdjustmentQuantity,
            dcQuantityBefore + dcAdjustmentQuantity -- 🟢 LE CALCUL EST ICI
        FROM @details;

        COMMIT TRANSACTION;

        -- 4. Retourner l'ID créé
        SELECT @newAdjustmentId AS stockAdjustmentId;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateStockLot] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_CreateStockLot]
    @storeId int,
    @productId bigint,
    @vcLotNumber varchar(30),
    @dcInitialQuantity decimal(18,3),
    @dcRemainingQuantity decimal(18,3),
    @mUnitPurchasePrice money,
    @dtReceivedAt datetime,
    @btEnabled bit = 1,
    @dtExpirationAt datetime = NULL -- 🟢 AJOUT DU PARAMÈTRE
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO dbo.tblStockLot (
            storeId, productId, vcLotNumber, dcInitialQuantity, 
            dcRemainingQuantity, mUnitPurchasePrice, dtReceivedAt, 
            btEnabled, dtExpirationAt -- 🟢 AJOUT DE LA COLONNE
        )
        VALUES (
            @storeId, @productId, @vcLotNumber, @dcInitialQuantity, 
            @dcRemainingQuantity, @mUnitPurchasePrice, @dtReceivedAt, 
            @btEnabled, @dtExpirationAt
        );

        -- Renvoie l'ID du lot créé
        SELECT SCOPE_IDENTITY() AS stockLotId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateStockTransfer] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_CreateStockTransfer]
    @vcTransferNumber      VARCHAR(30),
    @sourceStoreId         INT,
    @destinationStoreId    INT,
    @transferStatusId      INT,
    @createdByUserId       INT,
    @vcCarrierName         VARCHAR(50) = NULL,
    @details               dbo.StockTransferDetailCreateType READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @sourceStoreId IS NULL OR @sourceStoreId <= 0
            THROW 51802, 'sourceStoreId est obligatoire et doit être positif.', 1;
        IF @destinationStoreId IS NULL OR @destinationStoreId <= 0
            THROW 51803, 'destinationStoreId est obligatoire et doit être positif.', 1;
        IF @sourceStoreId = @destinationStoreId
            THROW 51803, 'La boutique source et destination doivent être différentes.', 1;
        IF NOT EXISTS (SELECT 1 FROM @details)
            THROW 51805, 'Au moins une ligne de transfert est requise.', 1;
        IF EXISTS (SELECT 1 FROM @details WHERE productId <= 0 OR dcRequestedQuantity <= 0)
            THROW 51806, 'Chaque ligne exige productId positif et dcRequestedQuantity > 0.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblRefTransferStatus WHERE transferStatusId = @transferStatusId)
            THROW 51807, 'Statut de transfert introuvable.', 1;

        INSERT INTO dbo.tblStockTransfer (
            vcTransferNumber, sourceStoreId, destinationStoreId,
            transferStatusId, createdByUserId, vcCarrierName, dtCreatedAt
        )
        OUTPUT INSERTED.stockTransferId, INSERTED.vcTransferNumber
        VALUES (@vcTransferNumber, @sourceStoreId, @destinationStoreId,
                @transferStatusId, @createdByUserId, @vcCarrierName, SYSUTCDATETIME());

        DECLARE @stockTransferId INT;
        SET @stockTransferId = SCOPE_IDENTITY();

        INSERT INTO dbo.tblStockTransferDetail (
            stockTransferId, productId, stockLotId, dcRequestedQuantity
        )
        SELECT @stockTransferId, productId, stockLotId, dcRequestedQuantity
        FROM @details;

        SELECT @stockTransferId AS stockTransferId, @vcTransferNumber AS vcTransferNumber;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree une boutique ou un entrepot. storeTypeId est resolu par RefDAL. */
CREATE   PROCEDURE [dbo].[sp_CreateStore]
	@companyId int,
	@storeTypeId int,
	@vcStoreCode varchar(20),
	@vcStoreName varchar(50),
	@createdByUserId int,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@dcLatitude decimal(9, 6) = NULL,
	@dcLongitude decimal(9, 6) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51700, 'companyId est obligatoire et doit etre positif.', 1;
		IF @storeTypeId IS NULL OR @storeTypeId <= 0
			THROW 51701, 'storeTypeId est obligatoire et doit etre positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcStoreCode)), '') IS NULL
			THROW 51702, 'vcStoreCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcStoreName)), '') IS NULL
			THROW 51703, 'vcStoreName est obligatoire.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 51704, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefStoreType WHERE storeTypeId = @storeTypeId)
			THROW 51701, 'Type de boutique introuvable.', 1;

		INSERT INTO dbo.tblStore (
			companyId, storeTypeId, vcStoreCode, vcStoreName, vcAddress, vcCity,
			vcPhoneNumber, dcLatitude, dcLongitude, createdByUserId,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT
			INSERTED.storeId, INSERTED.companyId, INSERTED.storeTypeId,
			INSERTED.vcStoreCode, INSERTED.vcStoreName, INSERTED.vcAddress,
			INSERTED.vcCity, INSERTED.vcPhoneNumber, INSERTED.dcLatitude,
			INSERTED.dcLongitude, INSERTED.btEnabled, INSERTED.dtCreatedAt
		VALUES (
			@companyId, @storeTypeId, LTRIM(RTRIM(@vcStoreCode)), LTRIM(RTRIM(@vcStoreName)),
			@vcAddress, @vcCity, @vcPhoneNumber, @dcLatitude, @dcLongitude,
			@createdByUserId, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateSupplier] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_CreateSupplier]
    @companyId INT,
    @vcSupplierCode VARCHAR(20) = NULL,
    @vcLastName VARCHAR(50) = NULL,
    @vcFirstName VARCHAR(50) = NULL,
    @vcBusinessName VARCHAR(50) = NULL,
    @vcPhoneNumber VARCHAR(20) = NULL,
    @vcEmail VARCHAR(100) = NULL,
    @vcAddress VARCHAR(150) = NULL,
    @vcCity VARCHAR(50) = NULL,
    @createdByUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- ✅ GÉNÉRATION AUTOMATIQUE DU CODE SI NULL
    IF NULLIF(LTRIM(RTRIM(@vcSupplierCode)), '') IS NULL
    BEGIN
        DECLARE @prefix VARCHAR(4) = 'FOUR';
        -- On essaie de prendre les 4 premières lettres du nom d'entreprise ou du nom
        IF NULLIF(LTRIM(RTRIM(@vcBusinessName)), '') IS NOT NULL
            SET @prefix = UPPER(LEFT(REPLACE(@vcBusinessName, ' ', ''), 4));
        ELSE IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NOT NULL
            SET @prefix = UPPER(LEFT(REPLACE(@vcLastName, ' ', ''), 4));
        
        -- On s'assure que le préfixe ne contient que des lettres (sans accents)
        SET @prefix = LEFT(REPLACE(REPLACE(REPLACE(@prefix, 'É', 'E'), 'È', 'E'), 'À', 'A'), 4);
        
        -- Boucle pour garantir l'unicité du code
        DECLARE @attempt INT = 0;
        WHILE @attempt < 5
        BEGIN
            SET @vcSupplierCode = @prefix + '-' + CAST(ABS(CHECKSUM(NEWID())) % 10000 AS VARCHAR(4));
            
            -- Si le code n'existe pas, on sort de la boucle
            IF NOT EXISTS (SELECT 1 FROM dbo.tblSupplier WHERE companyId = @companyId AND vcSupplierCode = @vcSupplierCode)
                BREAK;
                
            SET @attempt = @attempt + 1;
        END
    END

    -- Insertion
    INSERT INTO dbo.tblSupplier (
        companyId, vcSupplierCode, vcLastName, vcFirstName, vcBusinessName,
        vcPhoneNumber, vcEmail, vcAddress, vcCity, createdByUserId, btEnabled, dtCreatedAt, dtLastUpdated
    )
    VALUES (
        @companyId, LTRIM(RTRIM(@vcSupplierCode)), @vcLastName, @vcFirstName, @vcBusinessName,
        @vcPhoneNumber, @vcEmail, @vcAddress, @vcCity, @createdByUserId, 1, GETDATE(), GETDATE()
    );

    -- Retourner la ligne créée
    SELECT 
        supplierId, companyId, vcSupplierCode, vcLastName, vcFirstName, 
        vcBusinessName, vcPhoneNumber, vcEmail, vcAddress, vcCity, 
        btEnabled, dtCreatedAt
    FROM dbo.tblSupplier 
    WHERE supplierId = SCOPE_IDENTITY();
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_CreateUser] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  2. PROCÉDURES — CRÉATION DE BASE
==============================================================================*/

/*------------------------------------------------------------------------------
  2.1 sp_CreateUser
      Crée un utilisateur.
      Le hash du mot de passe est calculé en amont (bcrypt, côté Node.js).
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_CreateUser]
    @vcLastName     varchar(50),
    @vcPasswordHash varchar(255),
    @genderId       int = NULL,
    @vcFirstName    varchar(50) = NULL,
    @vcEmail        varchar(100) = NULL,
    @vcPhoneNumber  varchar(20) = NULL,
    @vcAddress      varchar(150) = NULL,
    @vcPhotoUrl     varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- Validations métier --- */
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
            THROW 51200, 'Le nom de famille est obligatoire.', 1;

        IF NULLIF(@vcPasswordHash, '') IS NULL
            THROW 51201, 'Le hash du mot de passe est obligatoire.', 1;

        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51202, 'Un email ou un numéro de téléphone est obligatoire.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51203, 'Le genre indiqué est introuvable.', 1;

        /* --- Insertion --- */
        INSERT INTO dbo.tblUser (
            vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
            vcPasswordHash, vcAddress, vcPhotoUrl, dtLastLoginAt,
            btIsActive, dtCreatedAt, dtLastUpdated
        )
        OUTPUT
            INSERTED.userId, INSERTED.vcLastName, INSERTED.vcFirstName,
            INSERTED.genderId, INSERTED.vcEmail, INSERTED.vcPhoneNumber,
            INSERTED.vcAddress, INSERTED.vcPhotoUrl,
            INSERTED.btIsActive, INSERTED.dtCreatedAt
        VALUES (
            LTRIM(RTRIM(@vcLastName)),
            NULLIF(LTRIM(RTRIM(@vcFirstName)), ''),
            @genderId,
            LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')),
            NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''),
            @vcPasswordHash,
            NULLIF(LTRIM(RTRIM(@vcAddress)), ''),
            NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''),
            NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_DecideExpense] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Approuve ou rejette uniquement une depense PENDING. */
CREATE   PROCEDURE [dbo].[sp_DecideExpense]
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
/****** Objet : StoredProcedure [dbo].[sp_DecideStockAdjustment] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Passe un ajustement PENDING vers APPROVED ou REJECTED. */
CREATE   PROCEDURE [dbo].[sp_DecideStockAdjustment]
	@stockAdjustmentId int,
	@adjustmentStatusId int,
	@approvedByUserId int,
	@vcApprovalComment varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		IF @approvedByUserId IS NULL OR @approvedByUserId <= 0
			THROW 52004, 'approvedByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblRefAdjustmentStatus
			WHERE adjustmentStatusId = @adjustmentStatusId AND vcCode IN ('APPROVED', 'REJECTED')
		)
			THROW 52008, 'La decision doit etre APPROVED ou REJECTED.', 1;

		UPDATE a
		SET adjustmentStatusId = @adjustmentStatusId,
			approvedByUserId = @approvedByUserId,
			dtApprovedAt = SYSUTCDATETIME(),
			vcApprovalComment = @vcApprovalComment
		OUTPUT INSERTED.stockAdjustmentId, INSERTED.adjustmentStatusId
		FROM dbo.tblStockAdjustment AS a
		WHERE a.stockAdjustmentId = @stockAdjustmentId
		  AND a.adjustmentStatusId = (
			SELECT adjustmentStatusId FROM dbo.tblRefAdjustmentStatus WHERE vcCode = 'PENDING'
		  );
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_DeleteNotification] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Desactivation logique d'une notification appartenant a l'utilisateur. */
CREATE   PROCEDURE [dbo].[sp_DeleteNotification]
	@notificationId bigint,
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @notificationId IS NULL OR @notificationId <= 0
			THROW 52604, 'notificationId invalide.', 1;
		IF @userId IS NULL OR @userId <= 0
			THROW 52600, 'userId invalide.', 1;
		UPDATE dbo.tblNotification
		SET btEnabled = 0
		WHERE notificationId = @notificationId AND userId = @userId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_DisableExpiredPromotions] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Desactive les promotions dont la date de fin est depassee. */
CREATE   PROCEDURE [dbo].[sp_DisableExpiredPromotions]
	@atDate datetime
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SET @atDate = COALESCE(@atDate, GETDATE());
		UPDATE dbo.tblPromotion
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE btEnabled = 1 AND dtEndDate < @atDate;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_FinalizeSale] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Finalise une vente DRAFT, ajoute les paiements, mouvements et passe a VALIDATED. */
CREATE   PROCEDURE [dbo].[sp_FinalizeSale]
	@saleId bigint,
	@userId int,
	@allowPartial bit = 1,
	@payments dbo.SalePaymentInputType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		BEGIN TRANSACTION;
		DECLARE @storeId int, @customerId int, @saleNumber varchar(20), @net money,
			@cancelled bit, @statusCode varchar(50), @validatedStatusId int;
		SELECT @storeId = s.storeId, @customerId = s.customerId, @saleNumber = s.vcSaleNumber,
			@net = s.mNetAmount, @cancelled = s.IsCancelled, @statusCode = rs.vcCode
		FROM dbo.tblSale AS s WITH (UPDLOCK, HOLDLOCK)
		INNER JOIN dbo.tblRefSaleStatus AS rs ON rs.saleStatusId = s.saleStatusId
		WHERE s.saleId = @saleId;
		IF @net IS NULL THROW 52113, 'Vente introuvable.', 1;
		IF @cancelled = 1 THROW 52114, 'Vente annulee : finalisation impossible.', 1;
		IF @statusCode <> 'DRAFT' THROW 52116, 'Seule une vente DRAFT peut etre finalisee.', 1;
		IF @userId IS NULL OR @userId <= 0 THROW 52117, 'userId invalide.', 1;

		DECLARE @paid money = COALESCE((SELECT SUM(mAmount) FROM @payments), 0);
		DECLARE @debt money = @net - @paid;
		IF @debt < 0 THROW 52118, 'Le montant encaisse depasse le net a payer.', 1;
		IF @debt > 0 AND @allowPartial = 0 THROW 52119, 'Encaissement partiel non autorise.', 1;
		IF @debt > 0 AND @customerId IS NULL THROW 52120, 'Une vente a credit exige un client.', 1;

		INSERT INTO dbo.tblSalePayment (
			saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			vcCallbackPayload, OperatorMessage, dtCreatedAt, dtLastUpdated
		)
		SELECT @saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
		FROM @payments;

		DECLARE @movementTypeId int;
		SELECT @movementTypeId = stockMovementTypeId FROM dbo.tblRefStockMovementType WHERE vcCode = 'SALE';
		IF @movementTypeId IS NULL THROW 52108, 'Type de mouvement SALE absent.', 1;
		DECLARE @lines table (rowNumber int IDENTITY(1,1) PRIMARY KEY, productId bigint, stockLotId int NULL, qty decimal(18,3));
		INSERT INTO @lines(productId, stockLotId, qty)
		SELECT productId, stockLotId, dcQuantity FROM dbo.tblSaleDetail WHERE saleId = @saleId;
		DECLARE @i int = 1, @n int = (SELECT COUNT(*) FROM @lines), @product bigint, @lot int, @qty decimal(18,3), @before decimal(18,3), @after decimal(18,3);
		WHILE @i <= @n
		BEGIN
			SELECT @product=productId, @lot=stockLotId, @qty=qty FROM @lines WHERE rowNumber=@i;
			MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
			USING (SELECT @storeId AS storeId, @product AS productId) AS source
			ON target.storeId=source.storeId AND target.productId=source.productId
			WHEN NOT MATCHED THEN INSERT(storeId,productId,dcAvailableQuantity,dcReservedQuantity,dtUpdatedAt)
			VALUES(source.storeId,source.productId,0,0,SYSUTCDATETIME());
			SELECT @before=dcAvailableQuantity FROM dbo.tblStoreStock WITH (UPDLOCK,HOLDLOCK) WHERE storeId=@storeId AND productId=@product;
			SET @after=@before-@qty;
			IF @after<0 THROW 52109, 'Stock insuffisant pour finaliser la vente.', 1;
			INSERT INTO dbo.tblStockMovement(storeId,productId,stockLotId,stockMovementTypeId,dcQuantity,dcStockBefore,dcStockAfter,vcReferenceType,referenceId,operatedByUserId,dtMovementAt,vcComment)
			VALUES(@storeId,@product,@lot,@movementTypeId,-@qty,@before,@after,'SALE',CONVERT(int,@saleId),@userId,SYSUTCDATETIME(),CONCAT('Finalisation vente ',@saleNumber));
			UPDATE dbo.tblStoreStock SET dcAvailableQuantity=@after,dtUpdatedAt=SYSUTCDATETIME() WHERE storeId=@storeId AND productId=@product;
			SET @i+=1;
		END;
		SELECT @validatedStatusId=saleStatusId FROM dbo.tblRefSaleStatus WHERE vcCode='VALIDATED';
		IF @validatedStatusId IS NULL THROW 52107, 'Statut VALIDATED absent.', 1;
		UPDATE dbo.tblSale SET saleStatusId=@validatedStatusId,mPaidAmount=@paid,mDebtAmount=@debt,
			dtSoldAt=SYSUTCDATETIME(),dtLastUpdated=SYSUTCDATETIME() WHERE saleId=@saleId;
		COMMIT TRANSACTION;
		SELECT @saleId AS saleId,'VALIDATED' AS statusCode,@paid AS mPaidAmount,@debt AS mDebtAmount;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_FindUserByLoginIdentifier] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  4. AUTHENTIFICATION
==============================================================================*/

/*------------------------------------------------------------------------------
  4.1 sp_FindUserByLoginIdentifier
      Recherche un utilisateur par email ou téléphone et retourne le hash.
      Le SuperAdmin inactif est reconnu : la vue
      vw_UserActiveAuthorizationScope ne filtre pas sur btIsActive pour GLOBAL.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_FindUserByLoginIdentifier]
    @vcEmail       varchar(100),
    @vcPhoneNumber varchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51204, 'L''identifiant email ou téléphone est obligatoire.', 1;

        /* Variante avec colonne optionnelle btMustChangePassword */
        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql
                N'SELECT TOP (1)
                    u.userId, u.vcLastName, u.vcFirstName, u.genderId,
                    u.vcEmail, u.vcPhoneNumber, u.vcPasswordHash,
                    u.vcAddress, u.vcPhotoUrl, u.btIsActive, u.dtCreatedAt,
                    CAST(ISNULL(u.btMustChangePassword, 0) AS bit) AS mustChangePassword
                  FROM dbo.tblUser AS u
                  WHERE (LOWER(u.vcEmail) = LOWER(@email) OR u.vcPhoneNumber = @phone)
                    AND EXISTS (
                        SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope AS a
                        WHERE a.userId = u.userId
                    );',
                N'@email varchar(100), @phone varchar(20)',
                @email = @vcEmail, @phone = @vcPhoneNumber;
        END
        ELSE
        BEGIN
            /* Variante sans la colonne optionnelle */
            SELECT TOP (1)
                u.userId, u.vcLastName, u.vcFirstName, u.genderId,
                u.vcEmail, u.vcPhoneNumber, u.vcPasswordHash,
                u.vcAddress, u.vcPhotoUrl, u.btIsActive, u.dtCreatedAt,
                CAST(CASE WHEN u.dtLastLoginAt IS NULL THEN 1 ELSE 0 END AS bit) AS mustChangePassword
            FROM dbo.tblUser AS u
            WHERE (LOWER(u.vcEmail) = LOWER(@vcEmail) OR u.vcPhoneNumber = @vcPhoneNumber)
              AND EXISTS (
                    SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope AS a
                    WHERE a.userId = u.userId
              );
        END;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetActivePromotionsForStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Promotions actives pour une boutique et une date donnee. */
CREATE   PROCEDURE [dbo].[sp_GetActivePromotionsForStore]
	@storeId int,
	@atDate datetime
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52408, 'storeId est obligatoire et doit etre positif.', 1;
		IF @atDate IS NULL SET @atDate = GETDATE();

		SELECT
			pr.promotionId, pr.companyId, pr.vcPromotionName,
			pr.discountTypeCode, pr.vcDiscountType, pr.dcDiscountValue,
			pr.dtStartDate, pr.dtEndDate
		FROM dbo.vw_PromotionDetails AS pr
		INNER JOIN dbo.vw_PromotionStoreDetails AS ps ON ps.promotionId = pr.promotionId
		WHERE ps.storeId = @storeId AND pr.btEnabled = 1
		  AND pr.dtStartDate <= @atDate AND pr.dtEndDate >= @atDate
		ORDER BY pr.dtEndDate ASC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetAllCompanies] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Liste toutes les entreprises actives. */
CREATE   PROCEDURE [dbo].[sp_GetAllCompanies]
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT companyId, vcCompanyCode, vcCompanyName, vcRccm, vcPhoneNumber,
			vcEmail, vcAddress, vcCity, vcLogoUrl, btEnabled, dtCreatedAt
		FROM dbo.vw_CompanyDetails
		WHERE btEnabled = 1
		ORDER BY vcCompanyName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetAllReferences] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Retourne toutes les lignes d'une cle de reference; filtre btEnabled si disponible. */
CREATE   PROCEDURE [dbo].[sp_GetAllReferences]
	@refKey varchar(50)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		DECLARE @tableName sysname;
		DECLARE @hasEnabled bit;
		SELECT @tableName = tableName, @hasEnabled = hasEnabledColumn
		FROM dbo.vw_ReferenceTableCatalog
		WHERE refKey = @refKey;
		IF @tableName IS NULL
			THROW 52200, 'Cle de reference inconnue.', 1;

		DECLARE @statement nvarchar(max) = N'SELECT * FROM dbo.' + QUOTENAME(@tableName);
		IF @hasEnabled = 1 SET @statement += N' WHERE btEnabled = 1';
		EXEC sys.sp_executesql @statement;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetArticlesWithDetails] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetArticlesWithDetails]
    @storeId INT = NULL,
    @companyId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @companyId IS NULL RETURN;

    SELECT 
        p.productId,
        p.vcProductName,
        p.vcProductCode,
        p.vcBarcode,
        p.vcImageUrl,
        p.dcDefaultAlertThreshold,
        p.companyId,
        c.vcCategoryName,
        
        sp.mCurrentSalePrice,
        sp.alertThreshold,
        
        ISNULL(ss.dcAvailableQuantity, 0) AS dcAvailableQuantity,
        
        s.storeId AS boutiqueId,
        s.vcStoreName AS storeName,
        s.vcStoreName AS StoreName,
        
        -- ✅ LE PRIX D'ACHAT EST RÉCUPÉRÉ SANS DOUBLON ICI
        ISNULL((
            SELECT TOP 1 ph.mPurchasePrice
            FROM dbo.tblProductPriceHistory ph
            WHERE ph.productId = p.productId 
              AND ph.storeId = s.storeId 
              AND ph.dtEffectiveTo IS NULL
            ORDER BY ph.dtEffectiveFrom DESC
        ), 0) AS mPurchasePrice,
        
        -- ✅ LE FOURNISSEUR EST RÉCUPÉRÉ SANS DOUBLON ICI
        ISNULL((
            SELECT TOP 1 f.vcBusinessName
            FROM dbo.tblSupplierProduct spd
            INNER JOIN dbo.tblSupplier f ON spd.supplierId = f.supplierId
            WHERE spd.productId = p.productId
            ORDER BY spd.IsPreferred DESC, spd.supplierProductId ASC
        ), 'Non spécifié') AS fournisseurNom
        
    FROM dbo.tblProduct p
    INNER JOIN dbo.tblProductCategory c ON p.productCategoryId = c.productCategoryId
    LEFT JOIN dbo.tblStoreProduct sp ON p.productId = sp.productId
    LEFT JOIN dbo.tblStore s ON sp.storeId = s.storeId
    LEFT JOIN dbo.tblStoreStock ss ON s.storeId = ss.storeId AND p.productId = ss.productId
    
    WHERE 
        p.companyId = @companyId
        AND (@storeId IS NULL OR sp.storeId = @storeId)
        AND p.btEnabled = 1
    ORDER BY p.vcProductName ASC;
END
GO
/****** Objet : StoredProcedure [dbo].[sp_GetArticlesWithPurchasePrice] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetArticlesWithPurchasePrice]
    @storeId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        p.productId,
        p.vcProductCode,
        p.vcProductName,
        p.vcBarcode,
        p.vcImageUrl,
        pc.vcCategoryName,
        sp.mCurrentSalePrice,
        sp.alertThreshold,
        ISNULL(st.dcAvailableQuantity, 0) AS dcAvailableQuantity,
        -- ✅ On récupère le prix d'achat du lot le plus récent
        (SELECT TOP 1 mUnitPurchasePrice FROM dbo.tblStockLot l WHERE l.productId = p.productId AND l.storeId = sp.storeId ORDER BY stockLotId DESC) AS mUnitPurchasePrice
    FROM dbo.tblStoreProduct sp
    INNER JOIN dbo.tblProduct p ON p.productId = sp.productId
    LEFT JOIN dbo.tblStoreStock st ON st.productId = p.productId AND st.storeId = sp.storeId
    LEFT JOIN dbo.tblProductCategory pc ON pc.productCategoryId = p.productCategoryId
    WHERE sp.storeId = @storeId 
      AND sp.btEnabled = 1 
      AND p.btEnabled = 1
    ORDER BY p.vcProductName ASC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetAuditLogs] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Historique pagine avec filtres optionnels multi-tenant. */
CREATE   PROCEDURE [dbo].[sp_GetAuditLogs]
	@companyId int = NULL,
	@storeId int = NULL,
	@userId int = NULL,
	@tableName sysname = NULL,
	@vcRecordId varchar(100) = NULL,
	@page int = 1,
	@limit int = 50
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @page IS NULL OR @page < 1 SET @page = 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 500 SET @limit = 50;

		DECLARE @offset int = (@page - 1) * @limit;
		SELECT
			auditLogId, userId, companyId, storeId, vcActionName, tableName,
			vcRecordId, vcOldValuesJson, vcNewValuesJson,
			vcIpAddress, vcUserAgent, btEnabled, dtCreatedAt
		FROM dbo.vw_AuditLogDetails
		WHERE (@companyId IS NULL OR companyId = @companyId)
		  AND (@storeId IS NULL OR storeId = @storeId)
		  AND (@userId IS NULL OR userId = @userId)
		  AND (@tableName IS NULL OR tableName = @tableName)
		  AND (@vcRecordId IS NULL OR vcRecordId = @vcRecordId)
		ORDER BY dtCreatedAt DESC, auditLogId DESC
		OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCashAdminData] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetCashAdminData]
    @userId INT,
    @companyId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    IF @companyId IS NULL
    BEGIN
        SELECT TOP 1 @companyId = companyId 
        FROM dbo.tblUserCompany uc
        WHERE uc.userId = @userId AND uc.btEnabled = 1;
    END

    IF @companyId IS NULL
    BEGIN
        SELECT CAST(NULL AS INT) AS treasuryAccountId WHERE 1=0;
        SELECT CAST(NULL AS INT) AS treasuryMovementId WHERE 1=0;
        SELECT CAST(NULL AS INT) AS transactionId WHERE 1=0;
        RETURN;
    END

    DECLARE @treasuryAccountId INT;
    DECLARE @treasuryTypeId INT = (SELECT TOP 1 treasuryAccountTypeId FROM dbo.tblRefTreasuryAccountType WHERE vcCode = 'CENTRAL_CASH');

    SELECT TOP 1 @treasuryAccountId = treasuryAccountId
    FROM dbo.tblTreasuryAccount
    WHERE companyId = @companyId AND storeId IS NULL AND treasuryAccountTypeId = @treasuryTypeId;

    IF @treasuryAccountId IS NULL
    BEGIN
        INSERT INTO dbo.tblTreasuryAccount (companyId, storeId, treasuryAccountTypeId, vcAccountName, mCurrentBalance, btEnabled, dtCreatedAt, dtLastUpdated)
        VALUES (@companyId, NULL, @treasuryTypeId, 'Caisse Centrale', 0, 1, GETDATE(), GETDATE());
        SET @treasuryAccountId = SCOPE_IDENTITY();
    END

    -- RECORDSET 1 : Infos du compte central
    SELECT 
        a.treasuryAccountId, a.companyId, a.vcAccountName, a.mCurrentBalance,
        a.btEnabled, t.vcCode AS typeCode, t.vcTreasuryAccountType
    FROM dbo.tblTreasuryAccount a
    INNER JOIN dbo.tblRefTreasuryAccountType t ON t.treasuryAccountTypeId = a.treasuryAccountTypeId
    WHERE a.treasuryAccountId = @treasuryAccountId;

    -- ✅ RECORDSET 2 : Mouvements de TOUS les comptes (Caisse Centrale, OM, MTN, Banque)
    SELECT TOP 50
        m.treasuryMovementId, 
        m.treasuryAccountId, 
        m.mAmount, 
        m.mBalanceBefore, 
        m.mBalanceAfter,
        m.vcDescription, 
        m.dtCreatedAt, 
        t.vcTreasuryMovementType, 
        t.direction,
        -- ✅ NOUVEAU : On ajoute le type de compte pour le frontend
        at.vcCode AS accountTypeCode,
        at.vcTreasuryAccountType AS accountTypeName,
        a.vcAccountName,
        ISNULL(s.vcStoreName, 'Boutique inconnue') AS boutiqueNom,
        ISNULL(LTRIM(RTRIM(u.vcFirstName + ' ' + u.vcLastName)), 'Gérant inconnu') AS gerantNom,
        ISNULL(LTRIM(RTRIM(adm.vcFirstName + ' ' + adm.vcLastName)), 'Admin') AS adminNom
    FROM dbo.tblTreasuryMovement m
    -- ✅ Jointure indispensable pour récupérer le nom et le type du compte
    INNER JOIN dbo.tblTreasuryAccount a ON a.treasuryAccountId = m.treasuryAccountId
    INNER JOIN dbo.tblRefTreasuryAccountType at ON at.treasuryAccountTypeId = a.treasuryAccountTypeId
    INNER JOIN dbo.tblRefTreasuryMovementType t ON t.treasuryMovementTypeId = m.treasuryMovementTypeId
    LEFT JOIN dbo.tblCashReport cr ON cr.cashReportId = m.cashReportId
    LEFT JOIN dbo.tblCashSession cs ON cs.cashSessionId = cr.cashSessionId
    LEFT JOIN dbo.tblCashRegister r ON r.cashRegisterId = cs.cashRegisterId
    LEFT JOIN dbo.tblStore s ON s.storeId = r.storeId
    LEFT JOIN dbo.tblUser u ON u.userId = cs.userId
    LEFT JOIN dbo.tblUser adm ON adm.userId = m.OperatedByUserId
    WHERE a.companyId = @companyId -- ✅ On filtre par entreprise, pas par compte
    ORDER BY m.dtCreatedAt DESC;

    -- RECORDSET 3 : TRANSACTIONS FINTECH (Ventes et Recouvrements)
    SELECT 
        s.saleId AS transactionId, 'VENTE' AS typeTransaction, s.vcSaleNumber AS reference,
        s.mNetAmount AS montant, pm.vcPaymentMethod AS modePaiement, s.dtSoldAt AS dateTransaction,
        ISNULL(LTRIM(RTRIM(c.vcFirstName + ' ' + c.vcLastName)), 'Client de passage') AS clientNom,
        ISNULL(st.vcStoreName, 'Boutique') AS boutiqueNom,
        ISNULL(LTRIM(RTRIM(u.vcFirstName + ' ' + u.vcLastName)), 'Serveur inconnu') AS operateurNom
    FROM dbo.tblSale s
    INNER JOIN dbo.tblSalePayment sp ON sp.saleId = s.saleId
    INNER JOIN dbo.tblRefPaymentMethod pm ON pm.paymentMethodId = sp.paymentMethodId
    LEFT JOIN dbo.tblCustomer c ON c.customerId = s.customerId
    LEFT JOIN dbo.tblStore st ON st.storeId = s.storeId
    LEFT JOIN dbo.tblUser u ON u.userId = s.sellerUserId
    WHERE s.companyId = @companyId AND s.IsCancelled = 0
      AND pm.vcCode IN ('ORANGE_MONEY', 'MTN_MOMO', 'CARD', 'BANK_TRANSFER')
    
    UNION ALL
    
    SELECT 
        dp.debtPaymentId AS transactionId, 'RECOUVREMENT' AS typeTransaction, 'RECOUV-' + CAST(dp.debtPaymentId AS VARCHAR(20)) AS reference,
        dp.mAmount AS montant, pm.vcPaymentMethod AS modePaiement, dp.dtCreatedAt AS dateTransaction,
        ISNULL(LTRIM(RTRIM(c.vcFirstName + ' ' + c.vcLastName)), 'Client Inconnu') AS clientNom,
        ISNULL(st.vcStoreName, 'Boutique') AS boutiqueNom,
        ISNULL(LTRIM(RTRIM(u.vcFirstName + ' ' + u.vcLastName)), 'Opérateur inconnu') AS operateurNom
    FROM dbo.tblDebtPayment dp
    INNER JOIN dbo.tblRefPaymentMethod pm ON pm.paymentMethodId = dp.paymentMethodId
    LEFT JOIN dbo.tblThirdPartyAccount tpa ON tpa.thirdPartyAccountId = dp.thirdPartyAccountId
    LEFT JOIN dbo.tblCustomer c ON c.customerId = tpa.customerId
    LEFT JOIN dbo.tblStore st ON st.storeId = dp.storeId
    LEFT JOIN dbo.tblUser u ON u.userId = dp.OperatedByUserId
    WHERE tpa.companyId = @companyId
      AND pm.vcCode IN ('ORANGE_MONEY', 'MTN_MOMO', 'CARD', 'BANK_TRANSFER')
    ORDER BY dateTransaction DESC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCashRegistersByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetCashRegistersByStore]
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 53100, 'storeId invalide.', 1;
		SELECT cashRegisterId,storeId,vcRegisterCode,vcRegisterName,btEnabled
		FROM dbo.vw_CashRegisterDetails
		WHERE storeId=@storeId AND btEnabled=1
		ORDER BY vcRegisterCode;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCashReportById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetCashReportById]
    @cashReportId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @cashSessionId INT;

    SELECT @cashSessionId = cashSessionId
    FROM dbo.tblCashReport
    WHERE cashReportId = @cashReportId;

    IF @cashSessionId IS NULL
    BEGIN
        THROW 50001, 'Rapport de caisse introuvable.', 1;
    END;

    -- 1. Informations du rapport
    SELECT
        r.*,
        u.vcFirstName AS userFirstName,
        u.vcLastName AS userLastName,
        st.vcStoreName AS storeName
    FROM dbo.tblCashReport r
    INNER JOIN dbo.tblCashSession cs
        ON cs.cashSessionId = r.cashSessionId
    INNER JOIN dbo.tblUser u
        ON u.userId = cs.userId
    INNER JOIN dbo.tblCashRegister cr
        ON cr.cashRegisterId = cs.cashRegisterId
    INNER JOIN dbo.tblStore st
        ON st.storeId = cr.storeId
    WHERE r.cashReportId = @cashReportId;

    -- 2. Articles vendus
    SELECT
        sd.saleDetailId,
        sd.saleId,
        sd.mLineAmount AS prixTotal,
        sd.dcQuantity AS quantite,
        sd.mUnitSalePrice AS prixUnitaire,
        p.vcProductName AS articleNom,
        p.vcProductCode AS articleCode,
        s.dtSoldAt
    FROM dbo.tblSaleDetail sd
    INNER JOIN dbo.tblSale s
        ON s.saleId = sd.saleId
    INNER JOIN dbo.tblProduct p
        ON p.productId = sd.productId
    WHERE s.cashSessionId = @cashSessionId;

    -- 3. Dépenses
    SELECT
        e.expenseId,
        e.mAmount AS montant,
        e.vcReason AS motif
    FROM dbo.tblExpense e
    WHERE e.cashSessionId = @cashSessionId;

    -- 4. Paiements des ventes
    SELECT
        sp.salePaymentId,
        sp.saleId,
        sp.methodCode,
        sp.vcPaymentMethod,
        sp.statusCode,
        sp.vcPaymentStatus,
        sp.mAmount,
        sp.vcTransactionId,
        sp.vcOperatorReference,
        sp.vcPayerPhoneNumber,
        sp.dtCreatedAt
    FROM dbo.vw_SalePaymentDetails sp
    INNER JOIN dbo.tblSale s
        ON s.saleId = sp.saleId
    WHERE s.cashSessionId = @cashSessionId
    ORDER BY sp.dtCreatedAt, sp.salePaymentId;

END;

GO
/****** Objet : StoredProcedure [dbo].[sp_GetCashReportsBySession] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetCashReportsBySession]
    @cashSessionId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT *
    FROM dbo.vw_CashReportDetails
    WHERE cashSessionId = @cashSessionId
    ORDER BY dtCreatedAt DESC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCashReportsFiltered] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetCashReportsFiltered]
	@UserId INT,
	@RoleCode VARCHAR(50),
	@StoreId INT = NULL,
	@CompanyId INT = NULL,
    @StartDate DATETIME = NULL,
    @EndDate DATETIME = NULL,
    @GerantId INT = NULL
AS
BEGIN
	SET NOCOUNT ON;
	
	SELECT * 
	FROM dbo.vw_CashReportDetails
	WHERE 
		-- 1. Sécurité Entreprise
		(@CompanyId IS NULL OR companyId = @CompanyId)
		
		-- 2. Sécurité Boutique
		AND (@StoreId IS NULL OR storeId = @StoreId)
		
		-- 3. ✅ RÈGLE STRICTE DE RÔLE
		AND (
			-- SuperAdmin voit TOUT sans exception
			@RoleCode = 'SUPER_ADMIN'
			OR 
			-- Admin voit UNIQUEMENT les rapports des Gérants/Managers, JAMAIS des Caissiers
			(@RoleCode = 'ADMIN' AND UPPER(ISNULL(creatorRoleCode, '')) != 'CASHIER')
			OR 
			-- Gérant voit les caissiers, sauf son propre rapport
			(@RoleCode = 'MANAGER' AND UPPER(ISNULL(creatorRoleCode, '')) = 'CASHIER' AND userId != @UserId)
		)
        
        -- 4. ✅ FILTRE PAR GERANT (On cherche les boutiques qu'il gère)
        AND (
            @GerantId IS NULL 
            OR storeId IN (SELECT storeId FROM dbo.tblUserStore WHERE userId = @GerantId AND btEnabled = 1)
        )

        -- 5. ✅ FILTRE PAR DATE DE DEBUT
        AND (@StartDate IS NULL OR dtCreatedAt >= @StartDate)

        -- 6. ✅ FILTRE PAR DATE DE FIN
        AND (@EndDate IS NULL OR dtCreatedAt < DATEADD(day, 1, @EndDate))
        
	ORDER BY dtCreatedAt DESC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCashSessionById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetCashSessionById]
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT * FROM dbo.vw_CashSessionDetails WHERE cashSessionId=@cashSessionId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCashSessionHistoryByUser] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetCashSessionHistoryByUser]
	@userId int,
	@limit int=50
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @limit IS NULL OR @limit<1 OR @limit>1000 SET @limit=50;
		SELECT TOP (@limit)
			cashSessionId,cashRegisterId,vcRegisterCode,vcRegisterName,
			cashSessionStatusId,statusCode,vcCashSessionStatus,mOpeningCaisse,
			dtOpenedAt,dtClosedAt,mDeclaredClosingAmount,IsReportGenerated
		FROM dbo.vw_CashSessionDetails
		WHERE userId=@userId
		ORDER BY dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCashSessionsByRegister] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetCashSessionsByRegister]
	@cashRegisterId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT cs.*,rs.vcCode AS statusCode,rs.vcCashSessionStatus,
			LTRIM(RTRIM(COALESCE(u.vcLastName,'')+' '+COALESCE(u.vcFirstName,''))) AS userName
		FROM dbo.tblCashSession AS cs
		INNER JOIN dbo.tblRefCashSessionStatus AS rs ON rs.cashSessionStatusId=cs.cashSessionStatusId
		INNER JOIN dbo.tblUser AS u ON u.userId=cs.userId
		WHERE cs.cashRegisterId=@cashRegisterId
		ORDER BY cs.dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCompaniesByUserId] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Entreprises accessibles a un utilisateur; conserve l'affectation globale du SUPER_ADMIN. */
CREATE   PROCEDURE [dbo].[sp_GetCompaniesByUserId]
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @userId IS NULL OR @userId <= 0
			THROW 53002, 'userId est obligatoire et doit etre positif.', 1;
		SELECT companyId, vcCompanyCode, vcCompanyName, vcCity,
			roleId, roleCode, roleName
		FROM dbo.vw_UserCompanyAccess
		WHERE userId = @userId AND btEnabled = 1
		  AND (companyEnabled = 1 OR companyId IS NULL)
		ORDER BY vcCompanyName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCompanyById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Entreprise par identifiant, active ou non. */
CREATE   PROCEDURE [dbo].[sp_GetCompanyById]
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 53003, 'companyId est obligatoire et doit etre positif.', 1;
		SELECT * FROM dbo.vw_CompanyDetails WHERE companyId = @companyId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCustomerById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetCustomerById]
	@customerId int,
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @customerId IS NULL OR @customerId <= 0
			THROW 51106, 'customerId est obligatoire et doit etre positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

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
/****** Objet : StoredProcedure [dbo].[sp_GetCustomerDebtEvolution] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER OFF
GO

CREATE PROCEDURE [dbo].[sp_GetCustomerDebtEvolution]
    @companyId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @companyId IS NULL OR @companyId <= 0
            THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

        SELECT
            CAST(m.dtCreatedAt AS DATE) AS date,
            ISNULL(s.vcStoreName, 'Boutique inconnue') AS boutiqueName,
            CASE WHEN t.direction = 1 THEN m.mAmount ELSE -m.mAmount END AS netChange
        FROM dbo.tblThirdPartyAccountMovement m
        INNER JOIN dbo.tblThirdPartyAccount acc ON acc.thirdPartyAccountId = m.thirdPartyAccountId
        LEFT JOIN dbo.tblStore s ON s.storeId = m.storeId
        INNER JOIN dbo.tblRefThirdPartyMovementType t ON t.thirdPartyMovementTypeId = m.thirdPartyMovementTypeId
        WHERE acc.companyId = @companyId
          AND t.vcCode IN ('CUSTOMER_DEBT', 'CUSTOMER_PAYMENT')
        ORDER BY m.dtCreatedAt ASC;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;

GO
/****** Objet : StoredProcedure [dbo].[sp_GetCustomerDebtHistory] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetCustomerDebtHistory]
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;

    SELECT 
        c.customerId,
        c.vcFirstName,
        c.vcLastName,
        m.mAmount AS montant,
        CASE 
            WHEN m.thirdPartyMovementTypeId = 1 THEN 'CREATION'
            WHEN m.thirdPartyMovementTypeId = 2 THEN 'REMBOURSEMENT'
            ELSE 'AUTRE'
        END AS type,
        m.dtCreatedAt AS datePaiement,
        'Cash' AS modePaiement,
        NULL AS transactionRef,
        ABS(m.mBalanceBefore) AS soldeAnterieur,
        ABS(m.mBalanceAfter) AS nouveauSolde,
        m.thirdPartyAccountMovementId AS referenceId,
        -- ✅ AJOUT : Récupération du nom de l'opérateur
        u.vcFirstName + ' ' + u.vcLastName AS operateurNom 
    FROM dbo.tblThirdPartyAccountMovement m
    INNER JOIN dbo.tblThirdPartyAccount a ON a.thirdPartyAccountId = m.thirdPartyAccountId
    INNER JOIN dbo.tblCustomer c ON c.customerId = a.customerId
    -- ✅ AJOUT : Jointure avec la table User
    LEFT JOIN dbo.tblUser u ON u.userId = m.operatedByUserId
    WHERE c.companyId = @companyId 
      AND a.customerId IS NOT NULL

	ORDER BY m.dtCreatedAt DESC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCustomerDebts] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetCustomerDebts]
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;
            
		SELECT 
			c.customerId,
			c.vcLastName,
			c.vcFirstName,
			c.vcPhoneNumber,
			-- ✅ Le vrai montant restant dû (calculé par tous les mouvements)
			ABS(tpa.dcCurrentBalance) AS mDebtAmount,
			-- Date de la dernière activité sur le compte
			tpa.dtLastMovementAt AS dtDueDate,
			-- Statut basé sur le solde
			CASE 
				WHEN tpa.dcCurrentBalance <> 0 THEN 'En retard' 
				ELSE 'Soldé' 
			END AS statut
		FROM dbo.tblCustomer c
		INNER JOIN dbo.tblThirdPartyAccount tpa ON tpa.customerId = c.customerId
		WHERE c.companyId = @companyId 
		  AND tpa.btEnabled = 1
		  -- On n'affiche que les clients qui ont encore une dette (solde > 0)
		  AND ABS(tpa.dcCurrentBalance) > 0
		ORDER BY ABS(tpa.dcCurrentBalance) DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetCustomersByCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetCustomersByCompany]
	@companyId int
AS
	BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;
		SELECT
			c.customerId,
			c.companyId,
			c.customerTypeId,
			c.customerTypeCode,
			c.vcCustomerType AS customerType,
			c.genderId,
			c.genderCode,
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
			c.fullSearchText,
			COALESCE(SUM(COALESCE(s.mNetAmount, 0)), 0) AS totalAchats,
			COALESCE(SUM(COALESCE(s.mPaidAmount, 0)), 0) AS totalPaye,
			COALESCE(SUM(COALESCE(s.mDebtAmount, 0)), 0) AS dette,
			MAX(CASE WHEN COALESCE(s.mDebtAmount, 0) > 0 THEN s.dtSoldAt END) AS echeanceDette
		FROM dbo.vw_CustomerDetails c
		LEFT JOIN dbo.tblSale s ON s.customerId = c.customerId AND (s.IsCancelled IS NULL OR s.IsCancelled = 0)
		WHERE c.companyId = @companyId
		GROUP BY
			c.customerId, c.companyId, c.customerTypeId, c.customerTypeCode,
			c.vcCustomerType, c.genderId, c.genderCode, c.vcCustomerCode,
			c.vcLastName, c.vcFirstName, c.vcEmail, c.vcPhoneNumber,
			c.vcQuartier, c.vcCity, c.createdByUserId, c.btEnabled,
			c.dtCreatedAt, c.dtLastUpdated, c.fullSearchText
		ORDER BY c.vcLastName, c.vcFirstName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetDebtPaymentsByAccount] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Historique des paiements d'un compte tiers, du plus recent au plus ancien. */
CREATE   PROCEDURE [dbo].[sp_GetDebtPaymentsByAccount]
	@thirdPartyAccountId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @thirdPartyAccountId IS NULL OR @thirdPartyAccountId <= 0
			THROW 52900, 'thirdPartyAccountId invalide.', 1;
		SELECT *
		FROM dbo.vw_DebtPaymentDetails
		WHERE thirdPartyAccountId = @thirdPartyAccountId
		ORDER BY dtCreatedAt DESC, debtPaymentId DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetDraftSalesBySession] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetDraftSalesBySession]
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 THROW 52110, 'cashSessionId invalide.', 1;
		SELECT saleId, vcSaleNumber, mNetAmount
		FROM dbo.vw_SaleDetails
		WHERE cashSessionId = @cashSessionId AND statusCode = 'DRAFT'
		  AND IsCancelled = 0 AND btEnabled = 1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetExpenseCategoriesByCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetExpenseCategoriesByCompany]
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
/****** Objet : StoredProcedure [dbo].[sp_GetExpensesByCashSession] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetExpensesByCashSession]
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
/****** Objet : StoredProcedure [dbo].[sp_GetExpensesByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetExpensesByStore]
	@storeId int = NULL,
    @companyId int = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF (@storeId IS NULL AND @companyId IS NULL) 
            THROW 52805, 'storeId ou companyId invalide.', 1;

		SELECT 
            e.expenseId, e.cashSessionId, e.storeId, c.vcExpenseCategory, 
            e.mAmount, e.vcReason, e.vcProofUrl, e.vcStatusCode,
			e.createdByUserId, LTRIM(RTRIM(u.vcFirstName + ' ' + u.vcLastName)) AS createdByName, 
            e.approvedByUserId, e.dtApprovedAt, e.dtCreatedAt
		FROM dbo.tblExpense e
        INNER JOIN dbo.tblExpenseCategory c ON c.expenseCategoryId = e.expenseCategoryId
        INNER JOIN dbo.tblUser u ON u.userId = e.createdByUserId
        INNER JOIN dbo.tblStore s ON s.storeId = e.storeId
		WHERE 
            -- ✅ Si l'Admin n'a pas de boutique, on prend tout
            (@storeId IS NULL OR e.storeId = @storeId)
            -- ✅ Filtre par entreprise
            AND (@companyId IS NULL OR s.companyId = @companyId)
		ORDER BY e.dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetExpenseSessionSummary] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Resume globale d'une session, y compris les statuts autres que APPROVED. */
CREATE   PROCEDURE [dbo].[sp_GetExpenseSessionSummary]
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
/****** Objet : StoredProcedure [dbo].[sp_GetFintechDebtPaymentsTotal] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE PROCEDURE [dbo].[sp_GetFintechDebtPaymentsTotal]
    @companyId INT,
    @storeId INT = NULL,
    @startDate DATETIME = NULL,
    @endDate DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ISNULL(SUM(dp.mAmount), 0) AS totalFintechDebt
    FROM dbo.tblDebtPayment dp
    INNER JOIN dbo.tblRefPaymentMethod pm ON pm.paymentMethodId = dp.paymentMethodId
    INNER JOIN dbo.tblThirdPartyAccount tpa ON tpa.thirdPartyAccountId = dp.thirdPartyAccountId
    WHERE tpa.companyId = @companyId
      AND pm.vcCode IN ('ORANGE_MONEY', 'MTN_MOMO', 'CARD', 'BANK_TRANSFER')
      AND (
          (@storeId IS NOT NULL AND dp.storeId = @storeId)
          OR 
          (@storeId IS NULL AND dp.cashSessionId IS NULL)
      )
      AND (@startDate IS NULL OR dp.dtCreatedAt >= @startDate)
      AND (@endDate IS NULL OR dp.dtCreatedAt < DATEADD(day, 1, @endDate));
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetInventoryDetails] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetInventoryDetails]
	@inventoryId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @inventoryId IS NULL OR @inventoryId<=0 THROW 52705, 'inventoryId invalide.', 1;
		SELECT * FROM dbo.vw_InventoryLineDetails
		WHERE inventoryId=@inventoryId
		ORDER BY inventoryDetailId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetInventoryHeader] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetInventoryHeader]
	@inventoryId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @inventoryId IS NULL OR @inventoryId<=0 THROW 52705, 'inventoryId invalide.', 1;
		SELECT * FROM dbo.vw_InventoryDetails WHERE inventoryId=@inventoryId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetLowStoreStock] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Produits actifs sous leur seuil d'alerte effectif. */
CREATE   PROCEDURE [dbo].[sp_GetLowStoreStock]
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51600, 'storeId est obligatoire et doit etre positif.', 1;
		SELECT
			productId, vcProductCode, vcProductName,
			dcAvailableQuantity, threshold
		FROM dbo.vw_StoreStockDetails
		WHERE storeId = @storeId AND productEnabled = 1 AND isLowStock = 1
		ORDER BY dcAvailableQuantity ASC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetMouvements] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetMouvements]
    @CompanyId INT,             -- ✅ La sécurité
    @StoreId INT = NULL,        -- Le filtre boutique
    @Statut VARCHAR(20) = NULL  -- Le filtre type/statut
AS
BEGIN
    SET NOCOUNT ON;

    -- 🛡️ SÉCURITÉ ABSOLUE : Pas d'entreprise, pas de données
    IF @CompanyId IS NULL RETURN;

    SELECT 
        t.stockTransferId AS id,
        t.vcTransferNumber AS reference,
        t.dtCreatedAt AS date,
        t.transferStatusId AS statutId,
        t.IsCancelled,
        sSource.vcStoreName AS origine,
        sDest.vcStoreName AS destination,
        t.vcCarrierName AS transporteur
    FROM dbo.tblStockTransfer t
    INNER JOIN dbo.tblStore sSource ON t.sourceStoreId = sSource.storeId
    INNER JOIN dbo.tblStore sDest ON t.destinationStoreId = sDest.storeId
    WHERE 
        -- ✅ Filtre entreprise (les deux boutiques doivent être dans la même entreprise)
        (sSource.companyId = @CompanyId OR sDest.companyId = @CompanyId)
        
        -- ✅ Filtre boutique
        AND (@StoreId IS NULL OR t.sourceStoreId = @StoreId OR t.destinationStoreId = @StoreId)
        
        -- ✅ Filtre statut
        AND (@Statut IS NULL OR t.transferStatusId = @Statut)
        
    ORDER BY t.dtCreatedAt DESC;
END
GO
/****** Objet : StoredProcedure [dbo].[sp_GetMyCashReports] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetMyCashReports]
    @userId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- ✅ On utilise la vue vw_CashReportDetails qui contient les bons calculs (comme pour l'Admin)
    SELECT * 
    FROM dbo.vw_CashReportDetails
    WHERE userId = @userId
    ORDER BY dtCreatedAt DESC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetNotificationsByUser] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Notifications actives et non expirees d'un utilisateur. */
CREATE   PROCEDURE [dbo].[sp_GetNotificationsByUser]
	@userId int,
	@limit int = 50,
	@unreadOnly bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @userId IS NULL OR @userId <= 0
			THROW 52600, 'userId est obligatoire et doit etre positif.', 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 50;
		SELECT TOP (@limit)
			notificationId, userId, companyId, storeId, notificationTypeId,
			typeCode, vcNotificationType, vcTitle, vcMessage, vcPriority,
			vcReferenceType, referenceId, vcActionUrl, btIsRead, dtReadAt,
			dtCreatedAt, dtExpiresAt
		FROM dbo.vw_NotificationDetails
		WHERE userId = @userId AND btEnabled = 1
		  AND (dtExpiresAt IS NULL OR dtExpiresAt > SYSUTCDATETIME())
		  AND (@unreadOnly = 0 OR btIsRead = 0)
		ORDER BY btIsRead ASC, dtCreatedAt DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetOpenCashSessionByRegister] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetOpenCashSessionByRegister]
	@cashRegisterId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT TOP (1) * FROM dbo.vw_CashSessionDetails
		WHERE cashRegisterId=@cashRegisterId AND statusCode='OPEN'
		ORDER BY dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetOpenCashSessionByUser] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetOpenCashSessionByUser]
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT TOP (1) * FROM dbo.vw_CashSessionDetails
		WHERE userId=@userId AND statusCode='OPEN'
		ORDER BY dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetOpenCashSessionByUserAndStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Session ouverte d'un utilisateur pour une boutique donnee (garde caisse ouverte). */
CREATE   PROCEDURE [dbo].[sp_GetOpenCashSessionByUserAndStore]
	@userId int,
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @userId IS NULL OR @userId <= 0
			THROW 53104, 'userId invalide.', 1;
		IF @storeId IS NULL OR @storeId <= 0
			THROW 53100, 'storeId invalide.', 1;
		SELECT TOP (1) *
		FROM dbo.vw_CashSessionDetails
		WHERE userId = @userId AND storeId = @storeId AND statusCode = 'OPEN'
		ORDER BY dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetOrCreateStoreStock] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Lit la ligne de stock ou l'initialise a zero, de maniere atomique. */
CREATE   PROCEDURE [dbo].[sp_GetOrCreateStoreStock]
	@storeId int,
	@productId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51600, 'storeId est obligatoire et doit etre positif.', 1;
		IF @productId IS NULL OR @productId <= 0
			THROW 51601, 'productId est obligatoire et doit etre positif.', 1;

		MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
		USING (SELECT @storeId AS storeId, @productId AS productId) AS source
			ON target.storeId = source.storeId AND target.productId = source.productId
		WHEN NOT MATCHED THEN
			INSERT (storeId, productId, dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt)
			VALUES (source.storeId, source.productId, 0, 0, SYSUTCDATETIME());

		SELECT storeStockId, storeId, productId,
			dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt
		FROM dbo.tblStoreStock
		WHERE storeId = @storeId AND productId = @productId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetOrCreateThirdPartyAccount] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Obtient le compte existant ou le cree, avec verrouillage contre les doublons concurrents. */
CREATE   PROCEDURE [dbo].[sp_GetOrCreateThirdPartyAccount]
	@companyId int,
	@customerId int = NULL,
	@supplierId int = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51400, 'companyId est obligatoire et doit etre positif.', 1;
		IF (@customerId IS NULL AND @supplierId IS NULL)
			OR (@customerId IS NOT NULL AND @supplierId IS NOT NULL)
			THROW 51401, 'Fournir exactement un customerId ou un supplierId.', 1;

		IF @customerId IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM dbo.tblCustomer
			WHERE customerId = @customerId AND companyId = @companyId
		)
			THROW 51402, 'Client absent ou rattache a une autre entreprise.', 1;
		IF @supplierId IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM dbo.tblSupplier
			WHERE supplierId = @supplierId AND companyId = @companyId
		)
			THROW 51403, 'Fournisseur absent ou rattache a une autre entreprise.', 1;

		DECLARE @accountId int;
		DECLARE @created table (
			thirdPartyAccountId int,
			companyId int,
			customerId int NULL,
			supplierId int NULL,
			dcCurrentBalance money
		);

		BEGIN TRANSACTION;
		IF @customerId IS NOT NULL
		BEGIN
			SELECT TOP (1) @accountId = thirdPartyAccountId
			FROM dbo.tblThirdPartyAccount WITH (UPDLOCK, HOLDLOCK)
			WHERE companyId = @companyId AND customerId = @customerId;
		END
		ELSE
		BEGIN
			SELECT TOP (1) @accountId = thirdPartyAccountId
			FROM dbo.tblThirdPartyAccount WITH (UPDLOCK, HOLDLOCK)
			WHERE companyId = @companyId AND supplierId = @supplierId;
		END;

		IF @accountId IS NULL
		BEGIN
			INSERT INTO dbo.tblThirdPartyAccount (
				companyId, customerId, supplierId, dcCurrentBalance,
				dtLastMovementAt, btEnabled, dtCreatedAt, dtLastUpdated
			)
			OUTPUT INSERTED.thirdPartyAccountId, INSERTED.companyId,
			       INSERTED.customerId, INSERTED.supplierId, INSERTED.dcCurrentBalance
				INTO @created (thirdPartyAccountId, companyId, customerId, supplierId, dcCurrentBalance)
			VALUES (
				@companyId, @customerId, @supplierId, 0,
				NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
			);
		END;
		COMMIT TRANSACTION;

		IF EXISTS (SELECT 1 FROM @created)
			SELECT thirdPartyAccountId, companyId, customerId, supplierId, dcCurrentBalance FROM @created;
		ELSE
			SELECT TOP (1) thirdPartyAccountId, companyId, customerId, supplierId, dcCurrentBalance
			FROM dbo.tblThirdPartyAccount
			WHERE thirdPartyAccountId = @accountId;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetProductById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- 2. Procédure manquante pour récupérer un produit par ID
-- ============================================================================
CREATE   PROCEDURE [dbo].[sp_GetProductById]
    @productId BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        p.productId,
        p.companyId,
        p.productCategoryId,
        p.unitOfMeasureId,
        p.vcProductCode,
        p.vcProductName,
        p.vcDescription,
        p.vcBarcode,
        p.vcImageUrl,
        p.dcDefaultAlertThreshold,
        p.btEnabled,
        p.dtCreatedAt,
        pc.vcCategoryName,
        uom.vcUnitOfMeasure
    FROM dbo.tblProduct p
    LEFT JOIN dbo.tblProductCategory pc ON pc.productCategoryId = p.productCategoryId
    LEFT JOIN dbo.tblRefUnitOfMeasure uom ON uom.unitOfMeasureId = p.unitOfMeasureId
    WHERE p.productId = @productId AND p.btEnabled = 1;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetProductsForExpiryPromotion] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Produits portant au moins un lot actif encore en stock, expirant avant la date limite. */
CREATE   PROCEDURE [dbo].[sp_GetProductsForExpiryPromotion]
	@storeId int,
	@limitDate date
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52408, 'storeId est obligatoire et doit etre positif.', 1;
		IF @limitDate IS NULL
			THROW 52410, 'limitDate est obligatoire.', 1;
		SELECT DISTINCT productId
		FROM dbo.tblStockLot
		WHERE storeId = @storeId AND btEnabled = 1
		  AND dtExpirationAt IS NOT NULL AND dtExpirationAt <= @limitDate
		  AND dcRemainingQuantity > 0
		ORDER BY productId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetPromotionProducts] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Produits couverts par une promotion. */
CREATE   PROCEDURE [dbo].[sp_GetPromotionProducts]
	@promotionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @promotionId IS NULL OR @promotionId <= 0
			THROW 52409, 'promotionId est obligatoire et doit etre positif.', 1;
		SELECT productId, vcProductCode, vcProductName
		FROM dbo.vw_PromotionProductDetails
		WHERE promotionId = @promotionId
		ORDER BY vcProductName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetPurchaseDetails] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetPurchaseDetails]
	@purchaseId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @purchaseId IS NULL OR @purchaseId <= 0 THROW 52305, 'purchaseId invalide.', 1;
		SELECT * FROM dbo.vw_PurchaseLineDetails
		WHERE purchaseId = @purchaseId
		ORDER BY purchaseDetailId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetPurchasesByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Achats actifs d'une boutique. */
CREATE   PROCEDURE [dbo].[sp_GetPurchasesByStore]
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 52301, 'storeId invalide.', 1;
		SELECT purchaseId, vcPurchaseNumber, supplierId, supplierName, storeId,
			purchaseStatusId, statusCode, vcPurchaseStatus, dtOrderAt, dtReceivedAt,
			mTotalAmount, createdByUserId, receivedByUserId
		FROM dbo.vw_PurchaseDetails
		WHERE storeId = @storeId AND btEnabled = 1
		ORDER BY dtOrderAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSaleCatalogByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetSaleCatalogByStore]
    @storeId INT = NULL,
    @companyId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @companyId IS NULL RETURN;

    SELECT 
        p.productId,
        p.vcProductName,
        p.vcProductCode,
        p.vcBarcode,
        p.vcImageUrl,
        p.dcDefaultAlertThreshold AS seuilAlerte,
        c.vcCategoryName AS categorie,
        
        s.storeId AS boutiqueId,
        s.vcStoreName AS storeName,
        
        sp.mCurrentSalePrice AS prixVente,
        
        ISNULL(ss.dcAvailableQuantity, 0) AS quantiteDisponible,
        ISNULL(ss.dcAvailableQuantity, 0) AS dcAvailableQuantity,
        
        -- ✅ SOUS-REQUÊTE POUR LE PRIX D'ACHAT (impossible de faire des doublons)
        ISNULL((
            SELECT TOP 1 ph.mPurchasePrice
            FROM dbo.tblProductPriceHistory ph
            WHERE ph.productId = p.productId 
              AND ph.storeId = s.storeId 
              AND ph.dtEffectiveTo IS NULL
            ORDER BY ph.dtEffectiveFrom DESC
        ), 0) AS prixAchat,
        
        ISNULL((
            SELECT TOP 1 ph.mPurchasePrice
            FROM dbo.tblProductPriceHistory ph
            WHERE ph.productId = p.productId 
              AND ph.storeId = s.storeId 
              AND ph.dtEffectiveTo IS NULL
            ORDER BY ph.dtEffectiveFrom DESC
        ), 0) AS mPurchasePrice,
        
        -- ✅ SOUS-REQUÊTE POUR LE FOURNISSEUR (impossible de faire des doublons)
        ISNULL((
            SELECT TOP 1 f.vcBusinessName
            FROM dbo.tblSupplierProduct spd
            INNER JOIN dbo.tblSupplier f ON spd.supplierId = f.supplierId
            WHERE spd.productId = p.productId
            ORDER BY spd.IsPreferred DESC, spd.supplierProductId ASC
        ), 'Non spécifié') AS fournisseurNom
        
    FROM dbo.tblProduct p
    INNER JOIN dbo.tblProductCategory c ON p.productCategoryId = c.productCategoryId
    INNER JOIN dbo.tblStoreProduct sp ON p.productId = sp.productId
    INNER JOIN dbo.tblStore s ON sp.storeId = s.storeId
    LEFT JOIN dbo.tblStoreStock ss ON s.storeId = ss.storeId AND p.productId = ss.productId

    WHERE 
        p.companyId = @companyId
        AND (@storeId IS NULL OR sp.storeId = @storeId)
        AND p.btEnabled = 1
        
    ORDER BY p.vcProductName ASC;
END
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSaleHeader] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetSaleHeader]
	@saleId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @saleId IS NULL OR @saleId <= 0 THROW 52111, 'saleId invalide.', 1;
		SELECT saleId, vcSaleNumber, companyId, storeId, cashSessionId, customerId,
			customerName, sellerUserId, sellerName, saleStatusId, statusCode, vcSaleStatus,
			mGrossAmount, mDiscountAmount, mNetAmount, mPaidAmount, mDebtAmount,
			dtSoldAt, IsCancelled, dtCancelledAt, vcCancellationReason, dtCreatedAt, dtLastUpdated
		FROM dbo.vw_SaleDetails
		WHERE saleId = @saleId AND btEnabled = 1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSaleLines] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetSaleLines]
	@saleId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @saleId IS NULL OR @saleId <= 0 THROW 52111, 'saleId invalide.', 1;
		SELECT * FROM dbo.vw_SaleLineDetails WHERE saleId = @saleId ORDER BY productId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSalePayments] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetSalePayments]
	@saleId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @saleId IS NULL OR @saleId <= 0 THROW 52111, 'saleId invalide.', 1;
		SELECT * FROM dbo.vw_SalePaymentDetails WHERE saleId = @saleId ORDER BY dtCreatedAt;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSalesByCashSession] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetSalesByCashSession]
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 THROW 52110, 'cashSessionId invalide.', 1;
		SELECT saleId, vcSaleNumber, companyId, storeId, cashSessionId, customerId,
			customerName, sellerUserId, sellerName, saleStatusId, statusCode, vcSaleStatus,
			mGrossAmount, mDiscountAmount, mNetAmount, mPaidAmount, mDebtAmount,
			dtSoldAt, IsCancelled
		FROM dbo.vw_SaleDetails
		WHERE cashSessionId = @cashSessionId AND btEnabled = 1
		ORDER BY dtSoldAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSalesByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetSalesByStore]
    @storeId INT = NULL,
    @companyId INT = NULL,
    @limit INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@limit)
        s.*,
        pm.vcCode AS modePaiement,
        -- ✅ AJOUT : On récupère le nom de la boutique
        ISNULL(st.vcStoreName, 'Boutique inconnue') AS boutiqueNom,
        -- ✅ AJOUT : On récupère le nom et prénom du gérant
        ISNULL(LTRIM(RTRIM(u.vcFirstName + ' ' + u.vcLastName)), 'Gérant inconnu') AS gerantNom
    FROM dbo.vw_SaleDetails s
    -- Jointure pour le companyId et le nom de la boutique
    INNER JOIN dbo.tblStore st ON st.storeId = s.storeId
    -- ✅ Jointure pour le nom du gérant (vendeur)
    LEFT JOIN dbo.tblUser u ON u.userId = s.sellerUserId
    -- Jointure pour le mode de paiement
    OUTER APPLY (
        SELECT TOP 1 sp.paymentMethodId
        FROM dbo.tblSalePayment sp
        WHERE sp.saleId = s.saleId
    ) p
    LEFT JOIN dbo.tblRefPaymentMethod pm ON pm.paymentMethodId = p.paymentMethodId
    WHERE 
        (@storeId IS NULL OR s.storeId = @storeId)
        AND (@companyId IS NULL OR st.companyId = @companyId)
    ORDER BY s.dtSoldAt DESC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSaleSessionSales] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetSaleSessionSales]
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 THROW 52110, 'cashSessionId invalide.', 1;
		SELECT s.saleId, s.vcSaleNumber, s.customerId, s.sellerUserId,
			s.mGrossAmount, s.mDiscountAmount, s.mNetAmount, s.mPaidAmount, s.mDebtAmount,
			s.dtSoldAt, s.IsCancelled, s.statusCode
		FROM dbo.vw_SaleDetails AS s
		WHERE s.cashSessionId = @cashSessionId
		ORDER BY s.dtSoldAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSaleSessionTotals] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetSaleSessionTotals]
    @cashSessionId INT
AS
BEGIN
    SET NOCOUNT ON;
    -- ✅ On sélectionne TOUTES les colonnes de la vue (y compris les rapports caissiers)
    SELECT * 
    FROM dbo.vw_CashSessionReportTotals 
    WHERE cashSessionId = @cashSessionId;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSessionDebtsGranted] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Dettes accordees (CUSTOMER_DEBT) sur les ventes d'une session. */
CREATE   PROCEDURE [dbo].[sp_GetSessionDebtsGranted]
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0
			THROW 51410, 'cashSessionId invalide.', 1;
		SELECT tm.thirdPartyAccountMovementId, tm.saleId, tm.mAmount,
			tm.mBalanceBefore, tm.mBalanceAfter, tm.dtCreatedAt,
			s.vcSaleNumber, s.customerId
		FROM dbo.tblThirdPartyAccountMovement tm
		INNER JOIN dbo.tblRefThirdPartyMovementType t ON tm.thirdPartyMovementTypeId = t.thirdPartyMovementTypeId
		INNER JOIN dbo.tblSale s ON tm.saleId = s.saleId
		WHERE s.cashSessionId = @cashSessionId AND t.vcCode = 'CUSTOMER_DEBT'
		ORDER BY tm.dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSessionFintechBreakdown] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE PROCEDURE [dbo].[sp_GetSessionFintechBreakdown]
    @cashSessionId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        pm.vcCode AS typeCode, 
        SUM(sp.mAmount) AS totalAmount
    FROM dbo.tblSalePayment sp
    INNER JOIN dbo.tblRefPaymentMethod pm ON pm.paymentMethodId = sp.paymentMethodId
    INNER JOIN dbo.tblSale s ON s.saleId = sp.saleId
    WHERE s.cashSessionId = @cashSessionId 
      AND s.IsCancelled = 0
      AND pm.vcCode NOT IN ('CASH', 'ESPECES') 
    GROUP BY pm.vcCode;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSessionRecoveryLines] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Lignes de recouvrement SUCCESS d'une session (detail des rapports de caisse). */
CREATE   PROCEDURE [dbo].[sp_GetSessionRecoveryLines]
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0
			THROW 52900, 'cashSessionId invalide.', 1;
		SELECT dp.debtPaymentId, dp.thirdPartyAccountId, dp.storeId, dp.mAmount,
			m.vcCode AS methodCode, ps.vcCode AS statusCode,
			a.customerId, a.supplierId, dp.dtCreatedAt
		FROM dbo.tblDebtPayment dp
		INNER JOIN dbo.tblRefPaymentMethod m ON dp.paymentMethodId = m.paymentMethodId
		INNER JOIN dbo.tblRefPaymentStatus ps ON dp.paymentStatusId = ps.paymentStatusId
		INNER JOIN dbo.tblThirdPartyAccount a ON dp.thirdPartyAccountId = a.thirdPartyAccountId
		WHERE dp.cashSessionId = @cashSessionId AND ps.vcCode = 'SUCCESS'
		ORDER BY dp.dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSessionRecoveryTotals] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Agregats des recouvrements d'une session (bilan de caisse). */
CREATE   PROCEDURE [dbo].[sp_GetSessionRecoveryTotals]
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0
			THROW 52900, 'cashSessionId invalide.', 1;
		SELECT
			COALESCE(SUM(CASE WHEN ps.vcCode = 'SUCCESS' THEN dp.mAmount ELSE 0 END), 0) AS mTotalRecoveries,
			COALESCE(SUM(CASE WHEN ps.vcCode = 'SUCCESS' AND m.vcCode IN ('ORANGE_MONEY','MTN_MOMO') THEN dp.mAmount ELSE 0 END), 0) AS mMobileRecoveries,
			COUNT(CASE WHEN ps.vcCode = 'SUCCESS' THEN 1 END) AS nbRecoveries
		FROM dbo.tblDebtPayment dp
		INNER JOIN dbo.tblRefPaymentMethod m ON dp.paymentMethodId = m.paymentMethodId
		INNER JOIN dbo.tblRefPaymentStatus ps ON dp.paymentStatusId = ps.paymentStatusId
		WHERE dp.cashSessionId = @cashSessionId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStockAdjustmentDetails] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Details d'un ajustement. */
CREATE   PROCEDURE [dbo].[sp_GetStockAdjustmentDetails]
	@stockAdjustmentId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		SELECT * FROM dbo.vw_StockAdjustmentLineDetails
		WHERE stockAdjustmentId = @stockAdjustmentId
		ORDER BY stockAdjustmentDetailId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStockAdjustmentHeader] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Entete d'un ajustement, avec motif, statut et boutique. */
CREATE   PROCEDURE [dbo].[sp_GetStockAdjustmentHeader]
	@stockAdjustmentId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		SELECT * FROM dbo.vw_StockAdjustmentDetails
		WHERE stockAdjustmentId = @stockAdjustmentId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStockAdjustmentsByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetStockAdjustmentsByStore]
    @storeId INT = NULL,
    @companyId INT = NULL, -- ✅ Reçu depuis Node.js
    @statusCode VARCHAR(20) = NULL,
    @limit INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@limit)
        a.stockAdjustmentId,
        a.dtcreatedAt AS dtCreatedAt,
        p.vcProductName AS Article,
        s.vcStoreName AS PointDeVente,
        r.vcAdjustmentReason AS Motif,
        a.vcJustification AS Note,
        d.dcAdjustmentQuantity AS Quantite,
        a.vcProofImageUrl AS Preuve,
        st.vcAdjustmentStatus AS Statut,
        a.approvedByUserId,
        a.dtApprovedAt
    FROM dbo.tblStockAdjustment a
    INNER JOIN dbo.tblStockAdjustmentDetail d ON a.stockAdjustmentId = d.stockAdjustmentId
    INNER JOIN dbo.tblProduct p ON d.productId = p.productId
    INNER JOIN dbo.tblStore s ON a.storeId = s.storeId
    INNER JOIN dbo.tblRefAdjustmentReason r ON a.adjustmentReasonId = r.adjustmentReasonId
    INNER JOIN dbo.tblRefAdjustmentStatus st ON a.adjustmentStatusId = st.adjustmentStatusId
    WHERE 
        -- ✅ SÉCURITÉ MULTI-ENTREPRISE
        -- Si @companyId est NULL, ça ne renvoie rien (sécurité maximale)
        s.companyId = @companyId
        
        -- ✅ FILTRE BOUTIQUE (Si NULL, l'Admin voit toutes les boutiques de son entreprise)
        AND (@storeId IS NULL OR a.storeId = @storeId)
        
        -- ✅ FILTRE STATUT (Optionnel)
        AND (@statusCode IS NULL OR st.vcCode = @statusCode)
        
    ORDER BY a.dtcreatedAt DESC;
END
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStockMovementsByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetStockMovementsByStore]
    @storeId INT = NULL,
    @companyId INT = NULL,
    @productId BIGINT = NULL,
    @stockMovementTypeId INT = NULL,
    @limit INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@limit)
        m.stockMovementId,
        m.dtMovementAt AS date,
        t.vcCode AS typeCode,              -- ✅ Le code (SALE, TRANSFER_OUT, etc.)
        t.vcStockMovementType AS typeLabel, -- ✅ Le libellé ("Sortie vente")
        
        s.vcStoreName AS storeName,        -- ✅ Nom de la boutique (Origine)
        p.vcProductName AS productName,    -- ✅ Nom du produit (Articles)
        
        m.dcQuantity AS quantity,
        m.vcComment AS commentaire,
        ISNULL(u.vcFirstName + ' ' + u.vcLastName, 'Système') AS userName
    FROM dbo.tblStockMovement m
    LEFT JOIN dbo.tblProduct p ON m.productId = p.productId
    LEFT JOIN dbo.tblStore s ON m.storeId = s.storeId
    LEFT JOIN dbo.tblRefStockMovementType t ON m.stockMovementTypeId = t.stockMovementTypeId
    LEFT JOIN dbo.tblUser u ON m.operatedByUserId = u.userId
    WHERE 
        (@companyId IS NULL OR s.companyId = @companyId)
        AND (@storeId IS NULL OR m.storeId = @storeId)
        AND (@productId IS NULL OR m.productId = @productId)
        AND (@stockMovementTypeId IS NULL OR m.stockMovementTypeId = @stockMovementTypeId)
    ORDER BY m.dtMovementAt DESC;
END
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStockTransferDetails] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetStockTransferDetails]
    @stockTransferId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM dbo.vw_StockTransferLineDetails WHERE stockTransferId = @stockTransferId;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStockTransferHeader] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetStockTransferHeader]
    @stockTransferId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM dbo.vw_StockTransferDetails WHERE stockTransferId = @stockTransferId;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStockTransfersByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetStockTransfersByStore]
    @storeId INT = NULL,
    @companyId INT = NULL,
    @limit INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    -- 🛡️ SÉCURITÉ ABSOLUE : Si l'ID de l'entreprise est NULL, on renvoie une liste vide
    IF @companyId IS NULL OR @companyId = 0
    BEGIN
        RETURN; 
    END

    SELECT TOP (@limit)
        t.stockTransferId,
        t.vcTransferNumber,
        t.dtCreatedAt,
        t.transferStatusId,
        t.IsCancelled,
        t.vcCarrierName,
        t.dtShippedAt,
        t.dtReceivedAt,
        
        sSource.storeId AS SourceStoreId,
        sSource.vcStoreName AS SourceStoreName,
        
        sDest.storeId AS DestinationStoreId,
        sDest.vcStoreName AS DestinationStoreName
    FROM dbo.tblStockTransfer t
    INNER JOIN dbo.tblStore sSource ON t.sourceStoreId = sSource.storeId
    INNER JOIN dbo.tblStore sDest ON t.destinationStoreId = sDest.storeId
    WHERE 
        -- ✅ SÉCURITÉ STRICTE : On exige que les DEUX boutiques soient dans l'entreprise
        (sSource.companyId = @companyId OR sDest.companyId = @companyId)
        
        AND (@storeId IS NULL OR t.sourceStoreId = @storeId OR t.destinationStoreId = @storeId)
        
    ORDER BY t.dtCreatedAt DESC;
END
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStoreAlertRecipients] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetStoreAlertRecipients]
    @storeId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- ✅ On récupère directement les utilisateurs de la boutique (Gérants et Caissiers)
    SELECT DISTINCT 
        u.userId, 
        u.vcEmail, 
        u.vcPhoneNumber,
        u.vcLastName,
        u.vcFirstName
    FROM dbo.tblUser u
    INNER JOIN dbo.tblUserStore us ON us.userId = u.userId
    INNER JOIN dbo.tblRefRole r ON r.roleId = us.roleId
    WHERE us.storeId = @storeId 
      AND us.btEnabled = 1 
      AND r.vcCode IN ('MANAGER', 'CASHIER')
      AND u.btIsActive = 1;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStoreById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetStoreById]
    @storeId INT,
    @companyId INT = NULL -- ✅ Nouveau paramètre
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        s.storeId,
        s.companyId,
        s.storeTypeId,
        st.vcCode AS storeTypeCode,
        s.vcStoreCode,
        s.vcStoreName,
        s.vcAddress,
        s.vcCity,
        s.vcPhoneNumber,
        s.dcLatitude,
        s.dcLongitude,
        s.btEnabled,
        s.dtCreatedAt,
        s.createdByUserId,
        c.vcCompanyCode,
        c.vcCompanyName
    FROM dbo.tblStore s
    INNER JOIN dbo.tblRefStoreType st ON s.storeTypeId = st.storeTypeId
    INNER JOIN dbo.tblCompany c ON s.companyId = c.companyId
    WHERE 
        s.storeId = @storeId
        -- ✅ SÉCURITÉ MULTI-ENTREPRISE
        AND (@companyId IS NULL OR s.companyId = @companyId);
END
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStoreProductForSale] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- On recrée la procédure proprement dans la bonne base
CREATE PROCEDURE [dbo].[sp_GetStoreProductForSale]
	@storeId int,
	@productId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT TOP (1) 
            storeProductId, 
            storeId, 
            productId, 
            mCurrentSalePrice, 
            alertThreshold
		FROM dbo.tblStoreProduct
		WHERE storeId = @storeId AND productId = @productId AND btEnabled = 1;
	END TRY 
    BEGIN CATCH 
        THROW; 
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStoreProducts] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetStoreProducts]
    @storeId INT,
    @onlyValidated BIT = 1 -- 1 = Validés seulement, 0 = Tous (pour l'onglet d'attente)
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        p.productId AS _id, 
        p.vcProductName AS nom, 
        p.vcProductCode AS code,
        p.vcDescription AS description,
        sp.mCurrentSalePrice AS prixVente,
        sp.alertThreshold AS seuilAlerte,
        sp.btEnabled AS estValide
    FROM dbo.tblStoreProduct sp
    INNER JOIN dbo.tblProduct p ON p.productId = sp.productId
    WHERE sp.storeId = @storeId 
      AND (@onlyValidated = 0 OR sp.btEnabled = 1) -- Filtre dynamique
    ORDER BY p.vcProductName ASC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStoreProductsByProduct] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_GetStoreProductsByProduct]
    @productId BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        sp.storeProductId,
        sp.storeId,
        p.vcProductName,
        p.vcProductCode,
        sp.mCurrentSalePrice,
        sp.alertThreshold,
        sp.btEnabled,
        sp.dtCreatedAt,
        sp.dtLastUpdated,
        sp.dcQuantity
    FROM dbo.tblStoreProduct sp
    INNER JOIN dbo.tblProduct p ON p.productId = sp.productId
    WHERE sp.productId = @productId
      AND sp.btEnabled = 1
    ORDER BY p.vcProductName ASC;
END;

GO
/****** Objet : StoredProcedure [dbo].[sp_GetStoresByCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Liste les boutiques d'une entreprise, avec filtre actif optionnel. */
CREATE   PROCEDURE [dbo].[sp_GetStoresByCompany]
	@companyId int,
	@onlyActive bit = 1
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51700, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			storeId, companyId, storeTypeId, vcStoreType,
			vcStoreCode, vcStoreName, vcAddress, vcCity, vcPhoneNumber,
			dcLatitude, dcLongitude, btEnabled
		FROM dbo.vw_StoreDetails
		WHERE companyId = @companyId AND (@onlyActive = 0 OR btEnabled = 1)
		ORDER BY vcStoreName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStoresByUserId] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  8.2 sp_GetStoresByUserId
      Liste les boutiques auxquelles un utilisateur est activement affecté.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_GetStoresByUserId]
    @userId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51220, 'userId est obligatoire et doit être positif.', 1;

        SELECT
            userStoreId, storeId, vcStoreCode, vcStoreName, companyId,
            roleId, roleCode, roleName, dtStartDate
        FROM dbo.vw_UserStoreDetails
        WHERE userId = @userId AND btEnabled = 1
        ORDER BY dtStartDate, vcStoreName;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetStoreStockByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Stock de la boutique; includeInactive suit le second argument du DAL. */
CREATE   PROCEDURE [dbo].[sp_GetStoreStockByStore]
	@storeId int,
	@includeInactive bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51600, 'storeId est obligatoire et doit etre positif.', 1;
		SELECT
			storeStockId, storeId, productId, vcProductCode, vcProductName,
			dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt
		FROM dbo.vw_StoreStockDetails
		WHERE storeId = @storeId
		  AND (@includeInactive = 1 OR productEnabled = 1)
		ORDER BY vcProductName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSupplierById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Fournisseur par identifiant, actif ou inactif comme le DAL courant. */
CREATE   PROCEDURE [dbo].[sp_GetSupplierById]
	@supplierId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;
		SELECT *
		FROM dbo.tblSupplier
		WHERE supplierId = @supplierId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSupplierProducts] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Produits rattaches a un fournisseur, actifs ou inactifs comme le DAL courant. */
CREATE   PROCEDURE [dbo].[sp_GetSupplierProducts]
	@supplierId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;
		SELECT
			supplierProductId, productId, vcProductCode, vcProductName,
			vcSupplierReference, mReferencePurchasePrice,
			deliveryLeadTimeDays, IsPreferred, btEnabled
		FROM dbo.vw_SupplierProductDetails
		WHERE supplierId = @supplierId
		ORDER BY vcProductName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetSuppliersByCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Liste les fournisseurs actifs d'une entreprise. */
CREATE   PROCEDURE [dbo].[sp_GetSuppliersByCompany]
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51500, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			supplierId, companyId, vcSupplierCode, vcBusinessName,
			vcLastName, vcFirstName, vcPhoneNumber, vcEmail,
			vcAddress, vcCity, btEnabled
		FROM dbo.vw_SupplierDetails
		WHERE companyId = @companyId AND btEnabled = 1
		ORDER BY supplierDisplayName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetThirdPartyAccountByCustomer] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Compte d'un client dans une entreprise. */
CREATE   PROCEDURE [dbo].[sp_GetThirdPartyAccountByCustomer]
	@companyId int,
	@customerId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51400, 'companyId est obligatoire et doit etre positif.', 1;
		IF @customerId IS NULL OR @customerId <= 0
			THROW 51404, 'customerId est obligatoire et doit etre positif.', 1;

		SELECT TOP (1)
			thirdPartyAccountId, companyId, customerId, supplierId,
			dcCurrentBalance, dtLastMovementAt, btEnabled, dtCreatedAt
		FROM dbo.tblThirdPartyAccount
		WHERE companyId = @companyId AND customerId = @customerId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetTotalApprovedExpensesBySession] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_GetTotalApprovedExpensesBySession]
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
/****** Objet : StoredProcedure [dbo].[sp_GetTotalDebtPayments] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE PROCEDURE [dbo].[sp_GetTotalDebtPayments]
    @companyId INT,
    @storeId INT = NULL,
    @startDate DATETIME = NULL,
    @endDate DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ISNULL(SUM(dp.mAmount), 0) AS totalDebt
    FROM dbo.tblDebtPayment dp
    INNER JOIN dbo.tblThirdPartyAccount tpa ON tpa.thirdPartyAccountId = dp.thirdPartyAccountId
    WHERE tpa.companyId = @companyId
      AND (
          (@storeId IS NOT NULL AND dp.storeId = @storeId)
          OR 
          (@storeId IS NULL AND dp.cashSessionId IS NULL)
      )
      AND (@startDate IS NULL OR dp.dtCreatedAt >= @startDate)
      AND (@endDate IS NULL OR dp.dtCreatedAt < DATEADD(day, 1, @endDate));
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetTotalValidatedReports] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_GetTotalValidatedReports]
    @storeId INT,
    @userId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT COALESCE(SUM(r.mTheoreticalBalance), 0) AS totalRapportsValides
    FROM dbo.tblCashReport r
    INNER JOIN dbo.tblCashSession cs ON cs.cashSessionId = r.cashSessionId
    INNER JOIN dbo.tblCashRegister cr ON cr.cashRegisterId = cs.cashRegisterId
    WHERE cr.storeId = @storeId
      AND cs.userId != @userId -- On exclut le gérant
      AND r.cashReportStatusId IN (2, 3); -- Rapports validés
END
GO
/****** Objet : StoredProcedure [dbo].[sp_GetUserById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  4.2 sp_GetUserById
      Retourne un utilisateur par son identifiant, sans exposer le hash.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_GetUserById]
    @userId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql
                N'SELECT
                    userId, vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
                    vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt,
                    dtLastUpdated, CAST(ISNULL(btMustChangePassword, 0) AS bit) AS mustChangePassword
                  FROM dbo.tblUser WHERE userId = @id;',
                N'@id int', @id = @userId;
        END
        ELSE
        BEGIN
            SELECT
                userId, vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
                vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt,
                dtLastUpdated,
                CAST(CASE WHEN dtLastLoginAt IS NULL THEN 1 ELSE 0 END AS bit) AS mustChangePassword
            FROM dbo.tblUser
            WHERE userId = @userId;
        END;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetUserCompanyRoles] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  8.3 sp_GetUserCompanyRoles
      Liste les rôles actifs d'un utilisateur dans une entreprise donnée.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_GetUserCompanyRoles]
    @userId int,
    @companyId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51230, 'userId est obligatoire et doit être positif.', 1;
        IF @companyId IS NULL OR @companyId <= 0
            THROW 51231, 'companyId est obligatoire et doit être positif.', 1;

        SELECT userCompanyId, roleId, roleCode, roleName, dtAssignedAt
        FROM dbo.vw_UserCompanyDetails
        WHERE userId = @userId AND companyId = @companyId AND btEnabled = 1
        ORDER BY dtAssignedAt;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_GetUserContext] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  4.4 sp_GetUserContext
      Retourne trois jeux de résultats :
        1. les affectations entreprise,
        2. les affectations boutique,
        3. le rôle global éventuel.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_GetUserContext]
    @userId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        /* Jeu 1 : entreprises */
        SELECT
            assignmentId AS userCompanyId, companyId, vcCompanyName,
            roleId, roleCode AS companyRoleCode
        FROM dbo.vw_UserAssignmentContext
        WHERE userId = @userId AND scopeType = 'COMPANY'
        ORDER BY assignedAt;

        /* Jeu 2 : boutiques */
        SELECT
            assignmentId AS userStoreId, storeId, vcStoreName, companyId,
            roleId, roleCode AS storeRoleCode
        FROM dbo.vw_UserAssignmentContext
        WHERE userId = @userId AND scopeType = 'STORE'
        ORDER BY assignedAt;

        /* Jeu 3 : rôle global */
        SELECT TOP (1) r.roleId, r.vcCode AS globalRoleCode
        FROM dbo.tblUserCompany AS uc
        INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
        WHERE uc.userId = @userId AND uc.companyId IS NULL
          AND uc.btEnabled = 1 AND r.vcCode = 'SUPER_ADMIN';
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_ListUsersByCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  8.4 sp_ListUsersByCompany
      Liste les utilisateurs ayant une affectation active dans une entreprise.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_ListUsersByCompany]
    @companyId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @companyId IS NULL OR @companyId <= 0
            THROW 51231, 'companyId est obligatoire et doit être positif.', 1;

        SELECT
            userCompanyId, userId, vcLastName, vcFirstName, vcEmail,
            vcPhoneNumber, roleId, roleCode, roleName, dtAssignedAt
        FROM dbo.vw_UserCompanyDetails
        WHERE companyId = @companyId AND btEnabled = 1
        ORDER BY vcLastName, vcFirstName;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_ListUsersByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  8. LISTINGS AVEC CONTRÔLE DE PÉRIMÈTRE
==============================================================================*/

/*------------------------------------------------------------------------------
  8.1 sp_ListUsersByStore
      Liste les utilisateurs affectés à une boutique.
      Si @requestedByUserId est fourni, un contrôle de périmètre garantit
      que l'appelant est habilité à consulter cette boutique.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_ListUsersByStore]
    @storeId           int,
    @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @storeId IS NULL OR @storeId <= 0
            THROW 51221, 'storeId est obligatoire et doit être positif.', 1;

        /* --- Contrôle de périmètre --- */
        IF @requestedByUserId IS NOT NULL
        BEGIN
            DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore WHERE storeId = @storeId);
            DECLARE @canAccess bit = 0;

            /* SuperAdmin : accès total */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
                SET @canAccess = 1;

            /* Admin de l'entreprise propriétaire */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'COMPANY'
                         AND companyId = @companyId
                         AND roleCode = 'ADMIN')
                SET @canAccess = 1;

            /* Manager ou Caissier affecté à cette boutique */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'STORE'
                         AND storeId = @storeId
                         AND roleCode IN ('MANAGER', 'CASHIER'))
                SET @canAccess = 1;

            IF @canAccess = 0
                THROW 51282, 'Accès refusé à cette boutique.', 1;
        END;

        SELECT
            userStoreId, userId, vcLastName, vcFirstName, vcEmail,
            vcPhoneNumber, roleId, roleCode, roleName, dtStartDate
        FROM dbo.vw_UserStoreDetails
        WHERE storeId = @storeId AND btEnabled = 1
        ORDER BY vcLastName, vcFirstName;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_MarkAllNotificationsAsRead] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Marque toutes les notifications non lues de l'utilisateur, conforme au DAL. */
CREATE   PROCEDURE [dbo].[sp_MarkAllNotificationsAsRead]
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @userId IS NULL OR @userId <= 0
			THROW 52600, 'userId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblNotification
		SET btIsRead = 1, dtReadAt = SYSUTCDATETIME()
		WHERE userId = @userId AND btIsRead = 0;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_MarkNotificationAsRead] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Marque une notification comme lue pour son proprietaire. */
CREATE   PROCEDURE [dbo].[sp_MarkNotificationAsRead]
	@notificationId bigint,
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @notificationId IS NULL OR @notificationId <= 0
			THROW 52604, 'notificationId invalide.', 1;
		IF @userId IS NULL OR @userId <= 0
			THROW 52600, 'userId invalide.', 1;
		UPDATE dbo.tblNotification
		SET btIsRead = 1, dtReadAt = SYSUTCDATETIME()
		WHERE notificationId = @notificationId AND userId = @userId AND btIsRead = 0;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_OpenCashSession] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Ouvre une session si aucune session ouverte n'existe pour la caisse ni l'utilisateur. */
CREATE   PROCEDURE [dbo].[sp_OpenCashSession]
	@cashRegisterId int,
	@userId int,
	@cashSessionStatusId int,
	@mOpeningCaisse money=0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashRegisterId IS NULL OR @cashRegisterId<=0 THROW 53103, 'cashRegisterId invalide.', 1;
		IF @userId IS NULL OR @userId<=0 THROW 53104, 'userId invalide.', 1;
		IF @mOpeningCaisse IS NULL OR @mOpeningCaisse<0 THROW 53105, 'mOpeningCaisse doit etre >= 0.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefCashSessionStatus WHERE cashSessionStatusId=@cashSessionStatusId AND vcCode='OPEN')
			THROW 53106, 'Le statut fourni doit etre OPEN.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblCashRegister WHERE cashRegisterId=@cashRegisterId AND btEnabled=1)
			THROW 53103, 'Caisse absente ou inactive.', 1;

		BEGIN TRANSACTION;
		IF EXISTS(
			SELECT 1 FROM dbo.tblCashSession WITH(UPDLOCK,HOLDLOCK)
			WHERE cashRegisterId=@cashRegisterId AND cashSessionStatusId=@cashSessionStatusId
		)
			THROW 53107, 'La caisse possede deja une session ouverte.', 1;
		IF EXISTS(
			SELECT 1 FROM dbo.tblCashSession WITH(UPDLOCK,HOLDLOCK)
			WHERE userId=@userId AND cashSessionStatusId=@cashSessionStatusId
		)
			THROW 53108, 'L utilisateur possede deja une session ouverte.', 1;

		INSERT INTO dbo.tblCashSession(
			cashRegisterId,userId,cashSessionStatusId,mOpeningCaisse,
			dtOpenedAt,dtClosedAt,mDeclaredClosingAmount,IsReportGenerated
		)
		OUTPUT INSERTED.cashSessionId,INSERTED.cashRegisterId,INSERTED.userId,INSERTED.mOpeningCaisse,INSERTED.dtOpenedAt
		VALUES(@cashRegisterId,@userId,@cashSessionStatusId,@mOpeningCaisse,SYSUTCDATETIME(),NULL,NULL,0);
		COMMIT TRANSACTION;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_RecordStockMovement] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_RecordStockMovement]
    @storeId int,
    @productId bigint,
    @stockLotId int = NULL,
    @stockMovementTypeId int,
    @dcQuantity decimal(18,3),
    @vcReferenceType varchar(30) = NULL,
    @referenceId int = NULL,
    @operatedByUserId int,
    @vcComment varchar(150) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @direction int = 1;
        SELECT @direction = direction FROM dbo.tblRefStockMovementType WHERE stockMovementTypeId = @stockMovementTypeId;
        DECLARE @qtyChange decimal(18,3) = @dcQuantity * @direction;
        DECLARE @stockBefore decimal(18,3) = 0;
        DECLARE @stockAfter decimal(18,3) = 0;

        SELECT @stockBefore = COALESCE(dcAvailableQuantity, 0) 
        FROM dbo.tblStoreStock WHERE storeId = @storeId AND productId = @productId;

        IF EXISTS (SELECT 1 FROM dbo.tblStoreStock WHERE storeId = @storeId AND productId = @productId)
        BEGIN
            UPDATE dbo.tblStoreStock 
            SET dcAvailableQuantity = dcAvailableQuantity + @qtyChange, dtUpdatedAt = GETDATE()
            WHERE storeId = @storeId AND productId = @productId;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.tblStoreStock (storeId, productId, dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt)
            VALUES (@storeId, @productId, @qtyChange, 0, GETDATE());
        END

        SET @stockAfter = @stockBefore + @qtyChange;

        INSERT INTO dbo.tblStockMovement (
            storeId, productId, stockLotId, stockMovementTypeId, 
            dcQuantity, dcStockBefore, dcStockAfter, 
            vcReferenceType, referenceId, 
            operatedByUserId, vcComment, dtMovementAt
        )
        VALUES (
            @storeId, @productId, @stockLotId, @stockMovementTypeId,
            @dcQuantity, @stockBefore, @stockAfter,
            @vcReferenceType, @referenceId,
            @operatedByUserId, @vcComment, GETDATE()
        );

        -- 🟢 AJOUTEZ CECI : Renvoyer l'ID du mouvement créé
        DECLARE @newId int = SCOPE_IDENTITY();
        SELECT @newId AS stockMovementId, @stockBefore AS dcStockBefore, @stockAfter AS dcStockAfter;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_RecordThirdPartyAccountMovement] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Enregistre un mouvement et actualise le solde; participe a une transaction appelante. */
CREATE   PROCEDURE [dbo].[sp_RecordThirdPartyAccountMovement]
	@thirdPartyAccountId int,
	@thirdPartyMovementTypeId int,
	@mAmount money,
	@operatedByUserId int,
	@saleId bigint = NULL,
	@purchaseId int = NULL,
	@debtPaymentId int = NULL,
	@storeId int = NULL,
	@note nvarchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @thirdPartyAccountId IS NULL OR @thirdPartyAccountId <= 0
			THROW 51405, 'thirdPartyAccountId est obligatoire et doit etre positif.', 1;
		IF @thirdPartyMovementTypeId IS NULL OR @thirdPartyMovementTypeId <= 0
			THROW 51406, 'thirdPartyMovementTypeId est obligatoire.', 1;
		IF @mAmount IS NULL OR @mAmount <= 0
			THROW 51407, 'mAmount doit etre strictement superieur a zero.', 1;
		IF @operatedByUserId IS NULL OR @operatedByUserId <= 0
			THROW 51408, 'operatedByUserId est obligatoire.', 1;

		DECLARE @direction smallint;
		SELECT @direction = direction
		FROM dbo.tblRefThirdPartyMovementType
		WHERE thirdPartyMovementTypeId = @thirdPartyMovementTypeId;
		IF @direction IS NULL OR @direction NOT IN (-1, 1)
			THROW 51406, 'Type de mouvement tiers absent ou direction invalide.', 1;

		DECLARE @startedTransaction bit = 0;
		IF @@TRANCOUNT = 0
		BEGIN
			BEGIN TRANSACTION;
			SET @startedTransaction = 1;
		END
		ELSE
			SAVE TRANSACTION ThirdPartyMovementSave;

		DECLARE @balanceBefore money;
		SELECT @balanceBefore = dcCurrentBalance
		FROM dbo.tblThirdPartyAccount WITH (UPDLOCK, HOLDLOCK)
		WHERE thirdPartyAccountId = @thirdPartyAccountId;
		IF @balanceBefore IS NULL
			THROW 51409, 'Compte tiers introuvable.', 1;

		DECLARE @balanceAfter money = @balanceBefore + (@direction * @mAmount);
		DECLARE @inserted table (
			thirdPartyAccountMovementId int,
			mBalanceAfter money
		);

		INSERT INTO dbo.tblThirdPartyAccountMovement (
			thirdPartyAccountId, thirdPartyMovementTypeId, saleId, purchaseId,
			debtPaymentId, storeId, mAmount, mBalanceBefore, mBalanceAfter,
			operatedByUserId, Note, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.thirdPartyAccountMovementId, INSERTED.mBalanceAfter
			INTO @inserted (thirdPartyAccountMovementId, mBalanceAfter)
		VALUES (
			@thirdPartyAccountId, @thirdPartyMovementTypeId, @saleId, @purchaseId,
			@debtPaymentId, @storeId, @mAmount, @balanceBefore, @balanceAfter,
			@operatedByUserId, @note, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		UPDATE dbo.tblThirdPartyAccount
		SET dcCurrentBalance = @balanceAfter,
			dtLastMovementAt = SYSUTCDATETIME(),
			dtLastUpdated = SYSUTCDATETIME()
		WHERE thirdPartyAccountId = @thirdPartyAccountId;

		IF @startedTransaction = 1 COMMIT TRANSACTION;
		SELECT thirdPartyAccountMovementId, mBalanceAfter FROM @inserted;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0
		BEGIN
			IF @startedTransaction = 1 ROLLBACK TRANSACTION;
			ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION ThirdPartyMovementSave;
		END;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_RevokeUserCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  9.2 sp_RevokeUserCompany
      Révoque une affectation utilisateur / entreprise.
      Réservée au SuperAdmin.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_RevokeUserCompany]
    @userCompanyId     bigint,
    @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userCompanyId IS NULL OR @userCompanyId <= 0
            THROW 51233, 'userCompanyId est obligatoire et doit être positif.', 1;

        /* Contrôle d'autorisation : SuperAdmin uniquement */
        IF @requestedByUserId IS NULL
           OR NOT EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @requestedByUserId
                  AND scopeType = 'GLOBAL'
                  AND roleCode = 'SUPER_ADMIN'
           )
            THROW 51260, 'Réservé au SuperAdmin.', 1;

        UPDATE dbo.tblUserCompany
        SET btEnabled = 0,
            dtEndedAt = SYSUTCDATETIME()
        WHERE userCompanyId = @userCompanyId AND btEnabled = 1;

        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_RevokeUserStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  9. RÉVOCATIONS AVEC CONTRÔLE DE PÉRIMÈTRE
==============================================================================*/

/*------------------------------------------------------------------------------
  9.1 sp_RevokeUserStore
      Révoque une affectation utilisateur / boutique.
      Contrôle de périmètre et protection des comptes Admin / SuperAdmin.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_RevokeUserStore]
    @userStoreId       bigint,
    @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userStoreId IS NULL OR @userStoreId <= 0
            THROW 51224, 'userStoreId est obligatoire et doit être positif.', 1;

        /* --- Récupération des informations sur la cible --- */
        DECLARE @targetUserId int, @storeId int, @companyId int, @targetRoleCode varchar(50);

        SELECT
            @targetUserId   = us.userId,
            @storeId        = us.storeId,
            @companyId      = s.companyId,
            @targetRoleCode = r.vcCode
        FROM dbo.tblUserStore AS us
        INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
        INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
        WHERE us.userStoreId = @userStoreId AND us.btEnabled = 1;

        IF @targetUserId IS NULL
            THROW 51224, 'Affectation introuvable ou déjà révoquée.', 1;

        /* --- Protection des comptes Admin / SuperAdmin --- */
        IF @requestedByUserId IS NOT NULL
           AND EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @targetUserId
                  AND roleCode IN ('SUPER_ADMIN', 'ADMIN')
           )
           AND NOT EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @requestedByUserId
                  AND scopeType = 'GLOBAL'
                  AND roleCode = 'SUPER_ADMIN'
           )
            THROW 51285, 'Impossible de révoquer un compte protégé.', 1;

        /* --- Contrôle de périmètre --- */
        IF @requestedByUserId IS NOT NULL
        BEGIN
            DECLARE @canRevoke bit = 0;

            /* SuperAdmin : accès total */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
                SET @canRevoke = 1;

            /* Admin de l'entreprise */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'COMPANY'
                         AND companyId = @companyId
                         AND roleCode = 'ADMIN')
                SET @canRevoke = 1;

            /* Manager de la boutique : uniquement sur un Caissier */
            IF @targetRoleCode = 'CASHIER'
               AND EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                           WHERE userId = @requestedByUserId
                             AND scopeType = 'STORE'
                             AND storeId = @storeId
                             AND roleCode = 'MANAGER')
                SET @canRevoke = 1;

            IF @canRevoke = 0
                THROW 51286, 'Vous n''êtes pas autorisé à révoquer cette affectation.', 1;
        END;

        UPDATE dbo.tblUserStore
        SET btEnabled = 0,
            dtEndDate = SYSUTCDATETIME()
        WHERE userStoreId = @userStoreId AND btEnabled = 1;

        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_SearchCustomers] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_SearchCustomers]
	@companyId int,
	@q varchar(100),
	@limit int = 50
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;
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
/****** Objet : StoredProcedure [dbo].[sp_SearchStoreProducts] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_SearchStoreProducts]
    @storeId INT,
    @q VARCHAR(100),
    @limit INT = 50
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@limit)
        p.productId,
        p.vcProductCode,
        p.vcProductName,
        p.vcBarcode,
        p.vcImageUrl,
        sp.mCurrentSalePrice,
        ISNULL(st.dcAvailableQuantity, 0) AS dcAvailableQuantity
    FROM dbo.tblProduct p
    INNER JOIN dbo.tblStoreProduct sp ON sp.productId = p.productId AND sp.storeId = @storeId
    LEFT JOIN dbo.tblStoreStock st ON st.productId = p.productId AND st.storeId = @storeId
    WHERE p.btEnabled = 1 
      AND sp.btEnabled = 1
      AND (
          p.vcProductName LIKE '%' + @q + '%' OR 
          p.vcProductCode LIKE '%' + @q + '%' OR 
          p.vcBarcode LIKE '%' + @q + '%'
      )
    ORDER BY p.vcProductName ASC;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_SetInventoryStatus] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Change d'etat; date de fin uniquement pour VALIDATED ou CANCELLED. */
CREATE   PROCEDURE [dbo].[sp_SetInventoryStatus]
	@inventoryId int,
	@inventoryStatusId int,
	@approvedByUserId int=NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @inventoryId IS NULL OR @inventoryId<=0 THROW 52705, 'inventoryId invalide.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefInventoryStatus WHERE inventoryStatusId=@inventoryStatusId)
			THROW 52706, 'Statut d inventaire introuvable.', 1;
		UPDATE i
		SET inventoryStatusId=@inventoryStatusId,
			approvedByUserId=COALESCE(@approvedByUserId,i.approvedByUserId),
			dtEndedAt=CASE WHEN rs.vcCode IN ('VALIDATED','CANCELLED') THEN SYSUTCDATETIME() ELSE i.dtEndedAt END
		OUTPUT INSERTED.inventoryId,INSERTED.inventoryStatusId
		FROM dbo.tblInventory AS i
		INNER JOIN dbo.tblRefInventoryStatus AS rs ON rs.inventoryStatusId=@inventoryStatusId
		WHERE i.inventoryId=@inventoryId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_SetMustChangePassword] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  4.3 sp_SetMustChangePassword
      Positionne le drapeau de changement obligatoire du mot de passe,
      si la colonne optionnelle existe.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_SetMustChangePassword]
    @userId int,
    @required bit
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        DECLARE @rowsAffected int = 0;

        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql
                N'UPDATE dbo.tblUser
                  SET btMustChangePassword = @flag, dtLastUpdated = SYSUTCDATETIME()
                  WHERE userId = @id;
                  SET @rows = @@ROWCOUNT;',
                N'@id int, @flag bit, @rows int OUTPUT',
                @id = @userId, @flag = @required, @rows = @rowsAffected OUTPUT;
        END;

        SELECT @rowsAffected AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_SetStockTransferStatus] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_SetStockTransferStatus]
    @stockTransferId      INT,
    @transferStatusId     INT,
    @approvedByUserId     INT = NULL,
    @vcCancellationReason VARCHAR(150) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @stockTransferId IS NULL OR @stockTransferId <= 0
            THROW 51808, 'stockTransferId est obligatoire et doit être positif.', 1;

        DECLARE @currentStatus VARCHAR(20);
        SELECT @currentStatus = st.vcCode
        FROM dbo.tblStockTransfer t
        INNER JOIN dbo.tblRefTransferStatus st ON t.transferStatusId = st.transferStatusId
        WHERE t.stockTransferId = @stockTransferId;

        IF @currentStatus IS NULL
            THROW 51808, 'Transfert introuvable.', 1;

        DECLARE @dtShippedAt DATETIME = NULL;
        DECLARE @dtReceivedAt DATETIME = NULL;
        DECLARE @newStatusCode VARCHAR(20);

        SELECT @newStatusCode = vcCode FROM dbo.tblRefTransferStatus WHERE transferStatusId = @transferStatusId;

        IF @newStatusCode = 'SHIPPED' SET @dtShippedAt = SYSUTCDATETIME();
        IF @newStatusCode = 'RECEIVED' SET @dtReceivedAt = SYSUTCDATETIME();

        UPDATE dbo.tblStockTransfer
        SET transferStatusId = @transferStatusId,
            approvedByUserId = @approvedByUserId,
            dtShippedAt = CASE WHEN @dtShippedAt IS NOT NULL THEN @dtShippedAt ELSE dtShippedAt END,
            dtReceivedAt = CASE WHEN @dtReceivedAt IS NOT NULL THEN @dtReceivedAt ELSE dtReceivedAt END,
            IsCancelled = CASE WHEN @newStatusCode = 'CANCELLED' THEN 1 ELSE IsCancelled END,
            vcCancellationReason = CASE WHEN @newStatusCode = 'CANCELLED' THEN @vcCancellationReason ELSE vcCancellationReason END
        WHERE stockTransferId = @stockTransferId;

        SELECT * FROM dbo.vw_StockTransferDetails WHERE stockTransferId = @stockTransferId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_SetUserActive] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  5. ACTIVATION / DÉSACTIVATION
==============================================================================*/

/*------------------------------------------------------------------------------
  5.1 sp_SetUserActive
      Active ou désactive un compte utilisateur.

      Contrôles :
        - interdiction d'auto-désactivation,
        - protection du compte SuperAdmin : seul un SuperAdmin peut le
          désactiver.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_SetUserActive]
    @userId            int,
    @btIsActive        bit,
    @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        /* Anti auto-désactivation */
        IF @requestedByUserId IS NOT NULL
           AND @requestedByUserId = @userId
           AND @btIsActive = 0
            THROW 51280, 'Auto-désactivation interdite.', 1;

        /* Protection du compte SuperAdmin */
        IF @btIsActive = 0
           AND EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @userId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN'
           )
           AND (@requestedByUserId IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                    WHERE userId = @requestedByUserId
                      AND scopeType = 'GLOBAL'
                      AND roleCode = 'SUPER_ADMIN'
                ))
            THROW 51281, 'Compte SuperAdmin protégé.', 1;

        UPDATE dbo.tblUser
        SET btIsActive = @btIsActive,
            dtLastUpdated = SYSUTCDATETIME()
        OUTPUT INSERTED.userId, INSERTED.vcEmail, INSERTED.btIsActive
        WHERE userId = @userId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_SoftDeleteCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Desactivation logique d'une entreprise. */
CREATE   PROCEDURE [dbo].[sp_SoftDeleteCompany]
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 53003, 'companyId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblCompany
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE companyId = @companyId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_SoftDeleteCustomer] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_SoftDeleteCustomer]
	@customerId int,
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @customerId IS NULL OR @customerId <= 0
			THROW 51106, 'customerId est obligatoire et doit etre positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

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
/****** Objet : StoredProcedure [dbo].[sp_SoftDeleteProduct] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_SoftDeleteProduct]
    @productId BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.tblProduct
    SET btEnabled = 0,
        dtLastUpdated = GETUTCDATE()
    WHERE productId = @productId
      AND btEnabled = 1;

    SELECT rowsAffected = @@ROWCOUNT;
END;

GO
/****** Objet : StoredProcedure [dbo].[sp_SoftDeleteStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Desactivation logique d'une boutique active. */
CREATE   PROCEDURE [dbo].[sp_SoftDeleteStore]
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51705, 'storeId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblStore
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE storeId = @storeId AND btEnabled = 1;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_SoftDeleteSupplier] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Desactivation logique du fournisseur. */
CREATE   PROCEDURE [dbo].[sp_SoftDeleteSupplier]
	@supplierId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblSupplier
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE supplierId = @supplierId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Mise a jour partielle identique au comportement COALESCE du DAL. */
CREATE   PROCEDURE [dbo].[sp_UpdateCompany]
	@companyId int,
	@vcCompanyName varchar(50) = NULL,
	@vcRccm varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcEmail nvarchar(100) = NULL,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL,
	@vcLogoUrl varchar(255) = NULL,
	@btEnabled bit = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 53003, 'companyId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblCompany
		SET vcCompanyName = COALESCE(@vcCompanyName, vcCompanyName),
			vcRccm = COALESCE(@vcRccm, vcRccm),
			vcPhoneNumber = COALESCE(@vcPhoneNumber, vcPhoneNumber),
			vcEmail = COALESCE(@vcEmail, vcEmail),
			vcAddress = COALESCE(@vcAddress, vcAddress),
			vcCity = COALESCE(@vcCity, vcCity),
			vcLogoUrl = COALESCE(@vcLogoUrl, vcLogoUrl),
			btEnabled = COALESCE(@btEnabled, btEnabled),
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.companyId, INSERTED.vcCompanyCode, INSERTED.vcCompanyName, INSERTED.btEnabled
		WHERE companyId = @companyId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateCustomer] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_UpdateCustomer]
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
			THROW 51106, 'customerId est obligatoire et doit etre positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

		IF @setCustomerType = 1
		BEGIN
			IF NULLIF(LTRIM(RTRIM(@customerTypeCode)), '') IS NULL
				THROW 51108, 'Le type de client ne peut pas etre NULL ou vide.', 1;
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
/****** Objet : StoredProcedure [dbo].[sp_UpdateInventoryCounts] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Met a jour les comptages physiques des lignes appartenant a l'inventaire. */
CREATE   PROCEDURE [dbo].[sp_UpdateInventoryCounts]
	@inventoryId int,
	@counts dbo.InventoryCountUpdateType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @inventoryId IS NULL OR @inventoryId<=0 THROW 52705, 'inventoryId invalide.', 1;
		IF EXISTS(SELECT 1 FROM @counts WHERE dcPhysicalQuantity<0)
			THROW 52704, 'La quantite physique doit etre >= 0.', 1;
		IF EXISTS(
			SELECT 1 FROM @counts AS c
			LEFT JOIN dbo.tblInventoryDetail AS d
				ON d.inventoryDetailId=c.inventoryDetailId AND d.inventoryId=@inventoryId
			WHERE d.inventoryDetailId IS NULL
		)
			THROW 52707, 'Ligne de comptage absente de cet inventaire.', 1;
		UPDATE d
		SET dcPhysicalQuantity=c.dcPhysicalQuantity
		FROM dbo.tblInventoryDetail AS d
		INNER JOIN @counts AS c ON c.inventoryDetailId=d.inventoryDetailId
		WHERE d.inventoryId=@inventoryId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateProduct] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[sp_UpdateProduct]
    @productId BIGINT,
    @vcProductName VARCHAR(50) = NULL,
    @vcDescription VARCHAR(150) = NULL,
    @vcBarcode VARCHAR(100) = NULL,
    @vcImageUrl VARCHAR(MAX) = NULL,
    @dcDefaultAlertThreshold DECIMAL(18,3) = NULL,
    @productCategoryId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- Vérifier que le produit existe
        IF NOT EXISTS (SELECT 1 FROM dbo.tblProduct WHERE productId = @productId)
            THROW 52530, 'Produit introuvable.', 1;

        -- Mise à jour partielle (on ne met à jour que si la valeur n'est pas NULL)
        UPDATE dbo.tblProduct
        SET 
            vcProductName = ISNULL(@vcProductName, vcProductName),
            vcDescription = ISNULL(@vcDescription, vcDescription),
            vcBarcode = ISNULL(@vcBarcode, vcBarcode),
            vcImageUrl = ISNULL(@vcImageUrl, vcImageUrl),
            dcDefaultAlertThreshold = ISNULL(@dcDefaultAlertThreshold, dcDefaultAlertThreshold),
            productCategoryId = ISNULL(@productCategoryId, productCategoryId),
            dtLastUpdated = GETDATE()
        WHERE productId = @productId;

        -- Retourner le produit mis à jour
        SELECT 
            productId, companyId, productCategoryId, vcProductCode, vcProductName, 
            vcBarcode, vcImageUrl, dcDefaultAlertThreshold, btEnabled, dtLastUpdated
        FROM dbo.tblProduct 
        WHERE productId = @productId;

    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdatePromotions] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- 🟢 Procédure pour les promotions
CREATE   PROCEDURE [dbo].[sp_UpdatePromotions]
    @storeId int,
    @productId bigint,
    @mPromoRate decimal(5,2),
    @btPromoActive bit,
    @dtPromoStart datetime,
    @dtPromoEnd datetime,
    @mExceptionDiscount decimal(5,2)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        UPDATE dbo.tblStoreProduct
        SET mPromoRate = @mPromoRate,
            btPromoActive = @btPromoActive,
            dtPromoStart = @dtPromoStart,
            dtPromoEnd = @dtPromoEnd,
            mExceptionDiscount = @mExceptionDiscount,
            dtLastUpdated = GETUTCDATE()
        WHERE storeId = @storeId AND productId = @productId;
    END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateStockTransferQuantities] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[sp_UpdateStockTransferQuantities]
    @stockTransferId INT,
    @quantities      dbo.StockTransferQuantityUpdateType READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @stockTransferId IS NULL OR @stockTransferId <= 0
            THROW 51808, 'stockTransferId est obligatoire et doit être positif.', 1;

        IF EXISTS (
            SELECT 1 FROM @quantities
            WHERE dcShippedQuantity < 0 OR dcReceivedQuantity < 0
        )
            THROW 51809, 'Quantités expédiées/reçues invalides.', 1;

        IF EXISTS (
            SELECT 1 FROM @quantities q
            LEFT JOIN dbo.tblStockTransferDetail d
                ON d.stockTransferDetailId = q.stockTransferDetailId
               AND d.stockTransferId = @stockTransferId
            WHERE d.stockTransferDetailId IS NULL
        )
            THROW 51810, 'Une ligne de quantité ne correspond pas à ce transfert.', 1;

        UPDATE d
        SET dcShippedQuantity = q.dcShippedQuantity,
            dcReceivedQuantity = q.dcReceivedQuantity
        FROM dbo.tblStockTransferDetail AS d
        INNER JOIN @quantities AS q ON q.stockTransferDetailId = d.stockTransferDetailId
        WHERE d.stockTransferId = @stockTransferId;

        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Mise a jour partielle; les indicateurs permettent de passer NULL explicitement. */
CREATE   PROCEDURE [dbo].[sp_UpdateStore]
	@storeId int,
	@vcStoreName varchar(50) = NULL,
	@setVcStoreName bit = 0,
	@vcAddress varchar(150) = NULL,
	@setVcAddress bit = 0,
	@vcCity varchar(50) = NULL,
	@setVcCity bit = 0,
	@vcPhoneNumber varchar(20) = NULL,
	@setVcPhoneNumber bit = 0,
	@dcLatitude decimal(9, 6) = NULL,
	@setDcLatitude bit = 0,
	@dcLongitude decimal(9, 6) = NULL,
	@setDcLongitude bit = 0,
	@btEnabled bit = NULL,
	@setBtEnabled bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51705, 'storeId est obligatoire et doit etre positif.', 1;
		IF @setVcStoreName = 1 AND NULLIF(LTRIM(RTRIM(@vcStoreName)), '') IS NULL
			THROW 51703, 'vcStoreName ne peut pas etre NULL ou vide.', 1;

		UPDATE dbo.tblStore
		SET vcStoreName = CASE WHEN @setVcStoreName = 1 THEN LTRIM(RTRIM(@vcStoreName)) ELSE vcStoreName END,
			vcAddress = CASE WHEN @setVcAddress = 1 THEN @vcAddress ELSE vcAddress END,
			vcCity = CASE WHEN @setVcCity = 1 THEN @vcCity ELSE vcCity END,
			vcPhoneNumber = CASE WHEN @setVcPhoneNumber = 1 THEN @vcPhoneNumber ELSE vcPhoneNumber END,
			dcLatitude = CASE WHEN @setDcLatitude = 1 THEN @dcLatitude ELSE dcLatitude END,
			dcLongitude = CASE WHEN @setDcLongitude = 1 THEN @dcLongitude ELSE dcLongitude END,
			btEnabled = CASE WHEN @setBtEnabled = 1 THEN @btEnabled ELSE btEnabled END,
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.storeId, INSERTED.vcStoreName, INSERTED.btEnabled, INSERTED.dtLastUpdated
		WHERE storeId = @storeId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateStorePrice] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_UpdateStorePrice]
    @storeId int,
    @productId bigint,
    @mCurrentSalePrice money,
    @mPurchasePrice money,
    @alertThreshold int = NULL,
    @createdByUserId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Mettre à jour le prix actuel pour la vente (si le produit existe déjà dans la boutique)
        IF EXISTS (SELECT 1 FROM dbo.tblStoreProduct WHERE storeId = @storeId AND productId = @productId)
        BEGIN
            UPDATE dbo.tblStoreProduct
            SET mCurrentSalePrice = @mCurrentSalePrice,
                alertThreshold = COALESCE(@alertThreshold, alertThreshold),
                dtLastUpdated = SYSUTCDATETIME()
            WHERE storeId = @storeId AND productId = @productId;
        END
        ELSE
        BEGIN
            -- Si le produit n'était pas encore vendu dans cette boutique, on l'ajoute
            INSERT INTO dbo.tblStoreProduct (storeId, productId, mCurrentSalePrice, alertThreshold, btEnabled, dtCreatedAt, dtLastUpdated)
            VALUES (@storeId, @productId, @mCurrentSalePrice, @alertThreshold, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        END

        -- 2. Ajouter la nouvelle ligne dans l'historique (Audit / Traçabilité)
        INSERT INTO dbo.tblProductPriceHistory (storeId, productId, mPurchasePrice, mSalePrice, dtEffectiveFrom, dtEffectiveTo, createdByUserId)
        VALUES (@storeId, @productId, @mPurchasePrice, @mCurrentSalePrice, SYSUTCDATETIME(), NULL, @createdByUserId);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateSupplier] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Mise a jour partielle suivant le comportement COALESCE actuel du DAL. */
CREATE   PROCEDURE [dbo].[sp_UpdateSupplier]
	@supplierId int,
	@vcBusinessName varchar(50) = NULL,
	@vcLastName varchar(50) = NULL,
	@vcFirstName varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcEmail varchar(100) = NULL,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL,
	@btEnabled bit = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;

		UPDATE dbo.tblSupplier
		SET vcBusinessName = COALESCE(@vcBusinessName, vcBusinessName),
			vcLastName = COALESCE(@vcLastName, vcLastName),
			vcFirstName = COALESCE(@vcFirstName, vcFirstName),
			vcPhoneNumber = COALESCE(@vcPhoneNumber, vcPhoneNumber),
			vcEmail = COALESCE(@vcEmail, vcEmail),
			vcAddress = COALESCE(@vcAddress, vcAddress),
			vcCity = COALESCE(@vcCity, vcCity),
			btEnabled = COALESCE(@btEnabled, btEnabled),
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.supplierId, INSERTED.vcSupplierCode, INSERTED.btEnabled
		WHERE supplierId = @supplierId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateUser] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  6. MODIFICATION
==============================================================================*/

/*------------------------------------------------------------------------------
  6.1 sp_UpdateUser
      Mise à jour partielle d'un utilisateur : seuls les champs fournis
      (non NULL) sont modifiés.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_UpdateUser]
    @userId         int,
    @vcLastName     varchar(50) = NULL,
    @vcFirstName    varchar(50) = NULL,
    @genderId       int = NULL,
    @vcEmail        varchar(100) = NULL,
    @vcPhoneNumber  varchar(20) = NULL,
    @vcAddress      varchar(150) = NULL,
    @vcPhotoUrl     varchar(255) = NULL,
    @vcPasswordHash varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51203, 'Le genre indiqué est introuvable.', 1;

        IF @vcEmail IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser
                       WHERE LOWER(vcEmail) = LOWER(@vcEmail) AND userId <> @userId)
            THROW 51271, 'Email déjà utilisé.', 1;

        IF @vcPhoneNumber IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser
                       WHERE vcPhoneNumber = @vcPhoneNumber AND userId <> @userId)
            THROW 51272, 'Téléphone déjà utilisé.', 1;

        UPDATE dbo.tblUser
        SET vcLastName     = COALESCE(@vcLastName, vcLastName),
            vcFirstName    = COALESCE(@vcFirstName, vcFirstName),
            genderId       = CASE WHEN @genderId IS NOT NULL THEN @genderId ELSE genderId END,
            vcEmail        = COALESCE(@vcEmail, vcEmail),
            vcPhoneNumber  = COALESCE(@vcPhoneNumber, vcPhoneNumber),
            vcAddress      = COALESCE(@vcAddress, vcAddress),
            vcPhotoUrl     = COALESCE(@vcPhotoUrl, vcPhotoUrl),
            vcPasswordHash = COALESCE(@vcPasswordHash, vcPasswordHash),
            dtLastUpdated  = SYSUTCDATETIME()
        OUTPUT INSERTED.userId, INSERTED.vcLastName, INSERTED.vcFirstName,
               INSERTED.vcEmail, INSERTED.vcPhoneNumber, INSERTED.dtLastUpdated
        WHERE userId = @userId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_UpdateUserLastLogin] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  4.5 sp_UpdateUserLastLogin
      Enregistre la date de dernière connexion en UTC.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[sp_UpdateUserLastLogin]
    @userId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        UPDATE dbo.tblUser
        SET dtLastLoginAt = SYSUTCDATETIME(),
            dtLastUpdated = SYSUTCDATETIME()
        WHERE userId = @userId;

        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[sp_ValidateStoreProduct] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_ValidateStoreProduct]
    @storeId INT,
    @productId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- On vérifie si l'article existe bien dans cette boutique
    IF EXISTS (SELECT 1 FROM dbo.tblStoreProduct WHERE storeId = @storeId AND productId = @productId)
    BEGIN
        UPDATE dbo.tblStoreProduct
        SET 
            btEnabled = 1,
            dtLastUpdated = GETDATE()
        WHERE storeId = @storeId AND productId = @productId;
        
        SELECT 1 AS success;
    END
    ELSE
    BEGIN
        THROW 50001, 'Article introuvable dans cette boutique.', 1;
    END
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_ApproveCashReport] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Approbation manager/admin suivant le workflow a deux etapes du DAL. */
CREATE   PROCEDURE [dbo].[usp_ApproveCashReport]
	@cashReportId int,
	@level varchar(10),
	@userId int,
	@isApproved bit,
	@comment varchar(250)=NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @level NOT IN ('MANAGER','ADMIN') THROW 53206, 'Niveau attendu: MANAGER ou ADMIN.', 1;
		IF @cashReportId IS NULL OR @cashReportId<=0 OR @userId IS NULL OR @userId<=0
			THROW 53207, 'cashReportId et userId doivent etre positifs.', 1;
		DECLARE @currentCode varchar(50),@targetCode varchar(50),@targetStatusId int;
		SELECT @currentCode=rs.vcCode
		FROM dbo.tblCashReport AS cr WITH(UPDLOCK,HOLDLOCK)
		INNER JOIN dbo.tblRefCashReportStatus AS rs ON rs.cashReportStatusId=cr.cashReportStatusId
		WHERE cr.cashReportId=@cashReportId;
		IF @currentCode IS NULL THROW 53208, 'Rapport de caisse introuvable.', 1;
		IF @level='MANAGER'
		BEGIN
			IF @currentCode<>'PENDING_MANAGER' THROW 53209, 'Le rapport n attend pas la decision du manager.', 1;
			SET @targetCode=CASE WHEN @isApproved=1 THEN 'PENDING_ADMIN' ELSE 'REJECTED' END;
		END
		ELSE
		BEGIN
			IF @currentCode<>'PENDING_ADMIN' THROW 53210, 'Le rapport n attend pas la decision de l administrateur.', 1;
			SET @targetCode=CASE WHEN @isApproved=1 THEN 'APPROVED' ELSE 'REJECTED' END;
		END;
		SELECT @targetStatusId=cashReportStatusId FROM dbo.tblRefCashReportStatus WHERE vcCode=@targetCode;
		IF @targetStatusId IS NULL THROW 53211, 'Statut cible de rapport introuvable.', 1;

		IF @level='MANAGER'
			UPDATE dbo.tblCashReport
			SET cashReportStatusId=@targetStatusId,managerApprovedByUserId=@userId,
				dtManagerApprovedAt=SYSUTCDATETIME(),vcManagerComment=@comment,dtLastUpdated=SYSUTCDATETIME()
			OUTPUT INSERTED.cashReportId,INSERTED.cashReportStatusId
			WHERE cashReportId=@cashReportId;
		ELSE
			UPDATE dbo.tblCashReport
			SET cashReportStatusId=@targetStatusId,adminApprovedByUserId=@userId,
				dtAdminApprovedAt=SYSUTCDATETIME(),vcAdminComment=@comment,dtLastUpdated=SYSUTCDATETIME()
			OUTPUT INSERTED.cashReportId,INSERTED.cashReportStatusId
			WHERE cashReportId=@cashReportId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_AssignUserToCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_AssignUserToCompany & usp_RevokeUserCompany
  Rôle : Gestion des liens Entreprise. Réservé exclusivement au SuperAdmin.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_AssignUserToCompany]
    @userId int, @companyId int, @roleId int, @createdByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @createdByUserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') THROW 51234, 'Seul un SuperAdmin peut affecter le rôle ADMIN.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.tblRefRole WHERE roleId = @roleId AND vcCode = 'ADMIN' AND btEnabled = 1) THROW 51235, 'Une affectation entreprise doit utiliser le rôle ADMIN.', 1;

        INSERT INTO dbo.tblUserCompany (userId, companyId, roleId, createdByUserId, dtAssignedAt, dtEndedAt, btEnabled)
        OUTPUT INSERTED.userCompanyId, INSERTED.userId, INSERTED.companyId, INSERTED.roleId, INSERTED.dtAssignedAt
        VALUES (@userId, @companyId, @roleId, @createdByUserId, SYSUTCDATETIME(), NULL, 1);
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_AssignUserToStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  5. AFFECTATIONS ET RÉVOCATIONS (Contrôle strict des périmètres)
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_AssignUserToStore
  Rôle : Affecte un utilisateur à une boutique.
  Sécurité : Un Manager ne peut affecter que des Caissiers. Un Manager ne peut 
             pas déplacer un Caissier vers une autre boutique.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_AssignUserToStore]
    @userId int, @storeId int, @roleId int, @assignedByUserId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @targetCompanyId int, @targetRoleCode varchar(50);
        DECLARE @isSuperAdmin bit = 0, @isCompanyAdmin bit = 0, @isStoreManager bit = 0;

        SELECT @targetCompanyId = companyId FROM dbo.tblStore WHERE storeId = @storeId AND btEnabled = 1;
        
        SELECT @isSuperAdmin = 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @assignedByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN';
        SELECT @isCompanyAdmin = 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @assignedByUserId AND scopeType = 'COMPANY' AND companyId = @targetCompanyId AND roleCode = 'ADMIN';
        SELECT @isStoreManager = 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @assignedByUserId AND scopeType = 'STORE' AND storeId = @storeId AND roleCode = 'MANAGER';

        IF @isSuperAdmin = 0 AND @isCompanyAdmin = 0 AND @isStoreManager = 0 THROW 51226, 'Auteur non autorisé pour cette boutique.', 1;
        
        -- Forcer le rôle CASHIER si c'est un Manager qui fait l'action
        IF @isStoreManager = 1 AND @isSuperAdmin = 0 AND @isCompanyAdmin = 0 SET @roleId = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'CASHIER' AND btEnabled = 1);
        
        INSERT INTO dbo.tblUserStore (userId, storeId, roleId, assignedByUserId, dtStartDate, dtEndDate, btEnabled)
        OUTPUT INSERTED.userStoreId, INSERTED.userId, INSERTED.storeId, INSERTED.roleId, INSERTED.dtStartDate
        VALUES (@userId, @storeId, @roleId, @assignedByUserId, SYSUTCDATETIME(), NULL, 1);
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CancelPurchase] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Annule uniquement un achat DRAFT ou ORDERED. */
CREATE   PROCEDURE [dbo].[usp_CancelPurchase]
	@purchaseId int,
	@cancelledStatusId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @purchaseId IS NULL OR @purchaseId<=0 THROW 52305, 'purchaseId invalide.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefPurchaseStatus WHERE purchaseStatusId=@cancelledStatusId AND vcCode='CANCELLED')
			THROW 52314, 'Statut CANCELLED absent ou invalide.', 1;
		UPDATE dbo.tblPurchase
		SET purchaseStatusId=@cancelledStatusId,dtLastUpdated=SYSUTCDATETIME()
		WHERE purchaseId=@purchaseId AND purchaseStatusId IN(
			SELECT purchaseStatusId FROM dbo.tblRefPurchaseStatus WHERE vcCode IN('DRAFT','ORDERED')
		);
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateAdminBySuperAdmin] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_CreateAdminBySuperAdmin
  Rôle : Crée un Admin rattaché à une entreprise.
  Sécurité : Vérifie que l'appelant (@createdByUserId) possède bien le rôle GLOBAL SUPER_ADMIN.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_CreateAdminBySuperAdmin]
    @createdByUserId int, @companyId int, @vcLastName varchar(50), @vcPasswordHash varchar(255),
    @vcFirstName varchar(50) = NULL, @genderId int = NULL, @vcEmail varchar(100) = NULL,
    @vcPhoneNumber varchar(20) = NULL, @vcAddress varchar(150) = NULL, @vcPhotoUrl varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        -- 1. Contrôle de sécurité
        IF @createdByUserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') THROW 51260, 'Réservé au SuperAdmin.', 1;
        
        -- 2. Validations
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL THROW 51200, 'Le nom est obligatoire.', 1;
        IF NULLIF(@vcPasswordHash, '') IS NULL THROW 51201, 'Le hash est obligatoire.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.tblCompany WHERE companyId = @companyId AND btEnabled = 1) THROW 51270, 'Entreprise introuvable ou inactive.', 1;
        IF @vcEmail IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail)) THROW 51271, 'Email déjà utilisé.', 1;

        DECLARE @adminRoleId int = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'ADMIN' AND btEnabled = 1);

        -- 3. Insertion atomique (Transaction)
        BEGIN TRANSACTION;
        DECLARE @newUserId int;
        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcPasswordHash, vcAddress, vcPhotoUrl, btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES (LTRIM(RTRIM(@vcLastName)), NULLIF(LTRIM(RTRIM(@vcFirstName)), ''), @genderId, LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')), NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''), @vcPasswordHash, NULLIF(LTRIM(RTRIM(@vcAddress)), ''), NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''), 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        
        SET @newUserId = SCOPE_IDENTITY();
        
        INSERT INTO dbo.tblUserCompany (userId, companyId, roleId, createdByUserId, dtAssignedAt, dtEndedAt, btEnabled)
        VALUES (@newUserId, @companyId, @adminRoleId, @createdByUserId, SYSUTCDATETIME(), NULL, 1);
        
        COMMIT TRANSACTION;
        SELECT @newUserId AS userId, @companyId AS companyId, @adminRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateAuditLog] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Insere une entree immuable d'audit et retourne le resume attendu par le DAL. */
CREATE   PROCEDURE [dbo].[usp_CreateAuditLog]
	@userId int = NULL,
	@companyId int = NULL,
	@storeId int = NULL,
	@vcActionName varchar(100),
	@tableName sysname,
	@vcRecordId varchar(100) = NULL,
	@vcOldValuesJson varchar(max) = NULL,
	@vcNewValuesJson varchar(max) = NULL,
	@vcIpAddress varchar(30) = NULL,
	@vcUserAgent varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcActionName)), '') IS NULL
			THROW 53300, 'vcActionName est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@tableName)), '') IS NULL
			THROW 53301, 'tableName est obligatoire.', 1;

		INSERT INTO dbo.tblAuditLog (
			userId, companyId, storeId, vcActionName, tableName, vcRecordId,
			vcOldValuesJson, vcNewValuesJson, vcIpAddress, vcUserAgent,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.auditLogId, INSERTED.userId, INSERTED.vcActionName,
		       INSERTED.tableName, INSERTED.vcRecordId, INSERTED.dtCreatedAt
		VALUES (
			@userId, @companyId, @storeId, @vcActionName, @tableName, @vcRecordId,
			@vcOldValuesJson, @vcNewValuesJson, @vcIpAddress, @vcUserAgent,
			1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateCashierForManager] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_CreateCashierForManager]
    @createdByUserId int, @storeId int, @vcLastName varchar(50), @vcPasswordHash varchar(255),
    @genderId int = NULL, @vcFirstName varchar(50) = NULL, @vcEmail varchar(100) = NULL,
    @vcPhoneNumber varchar(20) = NULL, @vcAddress varchar(150) = NULL, @vcPhotoUrl varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore WHERE storeId = @storeId AND btEnabled = 1);
        IF @companyId IS NULL THROW 51244, 'Boutique introuvable ou inactive.', 1;

        DECLARE @isSA bit = 0, @isAdmin bit = 0, @isMgr bit = 0;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') SET @isSA = 1;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'COMPANY' AND companyId = @companyId AND roleCode = 'ADMIN') SET @isAdmin = 1;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'STORE' AND storeId = @storeId AND roleCode = 'MANAGER') SET @isMgr = 1;
        IF @isSA = 0 AND @isAdmin = 0 AND @isMgr = 0 THROW 51245, 'Vous n''êtes pas autorisé à créer un caissier dans cette boutique.', 1;

        DECLARE @cashierRoleId int = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'CASHIER' AND btEnabled = 1);

        BEGIN TRANSACTION;
        DECLARE @newUserId int;
        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcPasswordHash, vcAddress, vcPhotoUrl, btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES (LTRIM(RTRIM(@vcLastName)), NULLIF(LTRIM(RTRIM(@vcFirstName)), ''), @genderId, LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')), NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''), @vcPasswordHash, NULLIF(LTRIM(RTRIM(@vcAddress)), ''), NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''), 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        SET @newUserId = SCOPE_IDENTITY();
        INSERT INTO dbo.tblUserStore (userId, storeId, roleId, assignedByUserId, dtStartDate, dtEndDate, btEnabled)
        VALUES (@newUserId, @storeId, @cashierRoleId, @createdByUserId, SYSUTCDATETIME(), NULL, 1);
        COMMIT TRANSACTION;
        SELECT @newUserId AS userId, @storeId AS storeId, @cashierRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateCashReport] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree le rapport et marque la session dans la meme transaction. */
CREATE   PROCEDURE [dbo].[usp_CreateCashReport]
	@cashSessionId int,
	@cashReportStatusId int,
	@mClosingAmount money,
	@mTotalRecoveriesOverride money = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0
			THROW 53200, 'cashSessionId invalide.', 1;
		IF @mClosingAmount IS NULL
			THROW 53201, 'mClosingAmount est obligatoire.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblRefCashReportStatus
			WHERE cashReportStatusId = @cashReportStatusId AND vcCode = 'PENDING_MANAGER'
		)
			THROW 53202, 'Le statut initial doit etre PENDING_MANAGER.', 1;

		BEGIN TRANSACTION;
		DECLARE @sessionStatus varchar(50), @opening money;
		SELECT @sessionStatus = rs.vcCode, @opening = cs.mOpeningCaisse
		FROM dbo.tblCashSession AS cs WITH (UPDLOCK,HOLDLOCK)
		INNER JOIN dbo.tblRefCashSessionStatus AS rs ON rs.cashSessionStatusId=cs.cashSessionStatusId
		WHERE cs.cashSessionId=@cashSessionId;
		IF @opening IS NULL THROW 53203, 'Session de caisse introuvable.', 1;
		IF @sessionStatus <> 'CLOSED' THROW 53204, 'La session doit etre fermee avant la generation du rapport.', 1;
		IF EXISTS(SELECT 1 FROM dbo.tblCashReport WHERE cashSessionId=@cashSessionId AND btEnabled=1)
			THROW 53205, 'Un rapport actif existe deja pour cette session.', 1;

		DECLARE @totals table(
			mTotalSales money,mTotalCash money,mTotalMobileMoney money,mTotalCredit money,
			mTotalRecoveries money,mTotalApprovedExpenses money,mTheoreticalBalance money
		);
		INSERT INTO @totals
		SELECT mTotalSales,mTotalCash,mTotalMobileMoney,mTotalCredit,
			mTotalRecoveries,mTotalApprovedExpenses,mTheoreticalBalance
		FROM dbo.vw_CashSessionReportTotals WHERE cashSessionId=@cashSessionId;
		IF NOT EXISTS(SELECT 1 FROM @totals)
			INSERT INTO @totals VALUES(0,0,0,0,0,0,@opening);

		DECLARE @sales money,@cash money,@mobile money,@credit money,@recoveries money,@expenses money,@theoretical money;
		SELECT @sales=mTotalSales,@cash=mTotalCash,@mobile=mTotalMobileMoney,@credit=mTotalCredit,
			@recoveries=COALESCE(@mTotalRecoveriesOverride,mTotalRecoveries),
			@expenses=mTotalApprovedExpenses,@theoretical=mTheoreticalBalance FROM @totals;
		DECLARE @inserted table(cashReportId int,cashSessionId int,mTheoreticalBalance money,mClosingAmount money,mDifferenceAmount money);
		INSERT INTO dbo.tblCashReport(
			cashSessionId,cashReportStatusId,mOpeningCashReport,mTotalSales,mTotalCash,
			mTotalMobileMoney,mTotalCredit,mTotalRecoveries,mTotalApprovedExpenses,
			mTheoreticalBalance,mClosingAmount,mDifferenceAmount,btEnabled,dtCreatedAt,dtLastUpdated
		)
		OUTPUT INSERTED.cashReportId,INSERTED.cashSessionId,INSERTED.mTheoreticalBalance,
			INSERTED.mClosingAmount,INSERTED.mDifferenceAmount
		INTO @inserted
		VALUES(@cashSessionId,@cashReportStatusId,@opening,@sales,@cash,@mobile,@credit,
			@recoveries,@expenses,@theoretical,@mClosingAmount,@mClosingAmount-@theoretical,
			1,SYSUTCDATETIME(),SYSUTCDATETIME());
		
		-- CORRECTION : Suppression de dtLastUpdated car la colonne n'existe pas dans tblCashSession
		UPDATE dbo.tblCashSession
		SET IsReportGenerated=1
		WHERE cashSessionId=@cashSessionId;
		
		COMMIT TRANSACTION;
		SELECT * FROM @inserted;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateManagerAndAssign] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_CreateManagerAndAssign]
    @vcLastName VARCHAR(50),
    @vcFirstName VARCHAR(50) = NULL,
    @vcEmail VARCHAR(100) = NULL,
    @vcPhoneNumber VARCHAR(20) = NULL,
    @vcPasswordHash VARCHAR(255),
    @storeId INT,
    @companyId INT,
    @createdByUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- 1. Vérifier que la boutique existe et appartient à l'entreprise
    IF NOT EXISTS (SELECT 1 FROM dbo.tblStore WHERE storeId = @storeId AND companyId = @companyId)
    BEGIN
        THROW 51001, 'La boutique spécifiée est introuvable ou n''appartient pas à cette entreprise.', 1;
    END;

    -- 2. Vérifier que le rôle MANAGER existe
    DECLARE @roleId INT;
    SELECT @roleId = roleId FROM dbo.tblRefRole WHERE vcCode = 'MANAGER';
    IF @roleId IS NULL
    BEGIN
        THROW 51002, 'Le rôle MANAGER est introuvable dans la table des rôles.', 1;
    END;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 3. Création de l'utilisateur (SANS @createdByUserId)
        -- On capture l'ID généré avec SCOPE_IDENTITY() si usp_CreateUser ne le retourne pas.
        -- Note : Si usp_CreateUser fait déjà un SELECT, on doit utiliser INSERT...EXEC pour capturer.
        
        -- On va chercher l'ID juste après l'insertion pour être sûr.
        EXEC dbo.usp_CreateUser 
            @vcLastName = @vcLastName,
            @vcFirstName = @vcFirstName,
            @vcEmail = @vcEmail,
            @vcPhoneNumber = @vcPhoneNumber,
            @vcPasswordHash = @vcPasswordHash;
        
        -- 4. Récupérer l'ID du nouvel utilisateur
        -- (On le cherche par email ou téléphone car il vient d'être créé)
        DECLARE @newUserId INT;
        SELECT TOP 1 @newUserId = userId 
        FROM dbo.tblUser 
        WHERE (vcEmail = @vcEmail AND @vcEmail IS NOT NULL) 
           OR (vcPhoneNumber = @vcPhoneNumber AND @vcPhoneNumber IS NOT NULL)
        ORDER BY userId DESC; -- On prend le plus récent
        
        IF @newUserId IS NULL
        BEGIN
            THROW 51003, 'Échec de la récupération de l''ID du nouvel utilisateur.', 1;
        END;

        -- 5. Affectation à la boutique (rôle MANAGER)
        INSERT INTO dbo.tblUserStore (userId, storeId, roleId, btEnabled)
        VALUES (@newUserId, @storeId, @roleId, 1);

        -- 6. Affectation à l'entreprise (rôle MANAGER)
        INSERT INTO dbo.tblUserCompany (userId, companyId, roleId, btEnabled)
        VALUES (@newUserId, @companyId, @roleId, 1);

        COMMIT TRANSACTION;

        -- 7. Retourner l'utilisateur créé
        SELECT 
            u.userId, u.vcLastName, u.vcFirstName, u.vcEmail,
            us.storeId, us.roleId, r.vcCode AS roleCode
        FROM dbo.tblUser u
        INNER JOIN dbo.tblUserStore us ON us.userId = u.userId
        INNER JOIN dbo.tblRefRole r ON r.roleId = us.roleId
        WHERE u.userId = @newUserId;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateManagerByAdmin] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_CreateManagerByAdmin
  Rôle : Crée un Manager rattaché à une boutique.
  Sécurité : Ouvert au SuperAdmin OU à l'Admin de l'entreprise à laquelle appartient la boutique.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_CreateManagerByAdmin]
    @createdByUserId int, @storeId int, @vcLastName varchar(50), @vcPasswordHash varchar(255),
    @vcFirstName varchar(50) = NULL, @genderId int = NULL, @vcEmail varchar(100) = NULL,
    @vcPhoneNumber varchar(20) = NULL, @vcAddress varchar(150) = NULL, @vcPhotoUrl varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore WHERE storeId = @storeId AND btEnabled = 1);
        IF @companyId IS NULL THROW 51274, 'Boutique introuvable ou inactive.', 1;

        -- Contrôle de sécurité (SuperAdmin OU Admin de cette entreprise)
        DECLARE @isSA bit = 0, @isAdmin bit = 0;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') SET @isSA = 1;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'COMPANY' AND companyId = @companyId AND roleCode = 'ADMIN') SET @isAdmin = 1;
        IF @isSA = 0 AND @isAdmin = 0 THROW 51275, 'Seul un SuperAdmin ou un Admin de cette entreprise peut créer un Manager.', 1;

        DECLARE @managerRoleId int = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'MANAGER' AND btEnabled = 1);

        BEGIN TRANSACTION;
        DECLARE @newUserId int;
        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcPasswordHash, vcAddress, vcPhotoUrl, btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES (LTRIM(RTRIM(@vcLastName)), NULLIF(LTRIM(RTRIM(@vcFirstName)), ''), @genderId, LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')), NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''), @vcPasswordHash, NULLIF(LTRIM(RTRIM(@vcAddress)), ''), NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''), 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        SET @newUserId = SCOPE_IDENTITY();
        INSERT INTO dbo.tblUserStore (userId, storeId, roleId, assignedByUserId, dtStartDate, dtEndDate, btEnabled)
        VALUES (@newUserId, @storeId, @managerRoleId, @createdByUserId, SYSUTCDATETIME(), NULL, 1);
        COMMIT TRANSACTION;
        SELECT @newUserId AS userId, @storeId AS storeId, @managerRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreatePurchase] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree un achat DRAFT et ses details dans une transaction unique. */
CREATE   PROCEDURE [dbo].[usp_CreatePurchase]
	@vcPurchaseNumber varchar(30),
	@supplierId int,
	@storeId int,
	@purchaseStatusId int,
	@dtOrderAt datetime2,
	@createdByUserId int,
	@details dbo.PurchaseDetailInputType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcPurchaseNumber)), '') IS NULL
			THROW 52300, 'vcPurchaseNumber est obligatoire.', 1;
		IF @supplierId IS NULL OR @supplierId <= 0 OR @storeId IS NULL OR @storeId <= 0
			THROW 52301, 'supplierId et storeId doivent etre positifs.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52302, 'createdByUserId doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM @details)
			THROW 52303, 'Au moins une ligne de detail est requise.', 1;
		IF EXISTS (SELECT 1 FROM @details WHERE productId <= 0 OR dcOrderedQuantity <= 0 OR mUnitPurchasePrice < 0)
			THROW 52304, 'Chaque ligne exige un produit, une quantite positive et un prix positif ou nul.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (purchaseId int, vcPurchaseNumber varchar(30), mTotalAmount money);
		INSERT INTO dbo.tblPurchase (
			vcPurchaseNumber, supplierId, storeId, purchaseStatusId,
			dtOrderAt, dtReceivedAt, mTotalAmount, createdByUserId, receivedByUserId,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.purchaseId, INSERTED.vcPurchaseNumber, INSERTED.mTotalAmount
			INTO @created (purchaseId, vcPurchaseNumber, mTotalAmount)
		VALUES (
			LTRIM(RTRIM(@vcPurchaseNumber)), @supplierId, @storeId, @purchaseStatusId,
			COALESCE(@dtOrderAt, SYSUTCDATETIME()), NULL, 0, @createdByUserId, NULL,
			1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
		DECLARE @purchaseId int = (SELECT purchaseId FROM @created);
		INSERT INTO dbo.tblPurchaseDetail (
			purchaseId, productId, dcOrderedQuantity, dcReceivedQuantity,
			mUnitPurchasePrice, vcLotNumber, dtExpirationAt
		)
		SELECT @purchaseId, productId, dcOrderedQuantity, 0,
			mUnitPurchasePrice, vcLotNumber, dtExpirationAt
		FROM @details;
		COMMIT TRANSACTION;
		SELECT purchaseId, vcPurchaseNumber, mTotalAmount FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateStockAdjustment] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Cree un ajustement et ses lignes dans une transaction unique. */
CREATE   PROCEDURE [dbo].[usp_CreateStockAdjustment]
	@storeId int,
	@adjustmentReasonId int,
	@adjustmentStatusId int,
	@vcJustification varchar(150),
	@vcProofImageUrl varchar(255) = NULL,
	@createdByUserId int,
	@details dbo.StockAdjustmentDetailCreateType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52000, 'storeId est obligatoire et doit etre positif.', 1;
		IF @adjustmentReasonId IS NULL OR @adjustmentReasonId <= 0
			THROW 52001, 'adjustmentReasonId est obligatoire.', 1;
		IF @adjustmentStatusId IS NULL OR @adjustmentStatusId <= 0
			THROW 52002, 'adjustmentStatusId est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcJustification)), '') IS NULL
			THROW 52003, 'vcJustification est obligatoire.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52004, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM @details)
			THROW 52005, 'Au moins une ligne d ajustement est requise.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefAdjustmentReason WHERE adjustmentReasonId = @adjustmentReasonId)
			THROW 52001, 'Motif d ajustement introuvable.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefAdjustmentStatus WHERE adjustmentStatusId = @adjustmentStatusId)
			THROW 52002, 'Statut d ajustement introuvable.', 1;
		IF EXISTS (
			SELECT 1 FROM @details
			WHERE productId <= 0 OR dcQuantityBefore < 0
			   OR dcQuantityBefore + dcAdjustmentQuantity < 0
		)
			THROW 52006, 'Chaque ligne doit conserver before >= 0 et after = before + delta >= 0.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (stockAdjustmentId int);
		INSERT INTO dbo.tblStockAdjustment (
			storeId, adjustmentReasonId, adjustmentStatusId, vcJustification,
			vcProofImageUrl, createdByUserId, approvedByUserId,
			dtcreatedAt, dtApprovedAt, vcApprovalComment
		)
		OUTPUT INSERTED.stockAdjustmentId INTO @created (stockAdjustmentId)
		VALUES (
			@storeId, @adjustmentReasonId, @adjustmentStatusId, LTRIM(RTRIM(@vcJustification)),
			@vcProofImageUrl, @createdByUserId, NULL,
			SYSUTCDATETIME(), NULL, NULL
		);

		DECLARE @stockAdjustmentId int = (SELECT stockAdjustmentId FROM @created);
		INSERT INTO dbo.tblStockAdjustmentDetail (
			stockAdjustmentId, productId, stockLotId,
			dcQuantityBefore, dcAdjustmentQuantity, dcQuantityAfter
		)
		SELECT
			@stockAdjustmentId, productId, stockLotId,
			dcQuantityBefore, dcAdjustmentQuantity,
			dcQuantityBefore + dcAdjustmentQuantity
		FROM @details;
		COMMIT TRANSACTION;
		SELECT stockAdjustmentId FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateTreasuryAccount] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  2. PROCÉDURES STOCKÉES (Logique métier)
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_CreateTreasuryAccount
  Rôle : Crée un nouveau compte de trésorerie.
  Sécurité : Vérifie que le type de compte demandé existe bien dans les référentiels.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_CreateTreasuryAccount]
	@companyId int,
	@storeId int = NULL,
	@treasuryAccountTypeId int,
	@vcAccountName varchar(50),
	@mCurrentBalance money = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		-- Validations des données d'entrée
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51300, 'companyId est obligatoire et doit etre positif.', 1;
		IF @treasuryAccountTypeId IS NULL OR @treasuryAccountTypeId <= 0
			THROW 51301, 'Le type de compte est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcAccountName)), '') IS NULL
			THROW 51302, 'vcAccountName est obligatoire.', 1;
		IF @mCurrentBalance IS NULL
			THROW 51303, 'Le solde initial ne peut pas etre NULL.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblRefTreasuryAccountType
			WHERE treasuryAccountTypeId = @treasuryAccountTypeId
		)
			THROW 51301, 'Type de compte de tresorerie introuvable.', 1;

		-- Insertion du compte
		INSERT INTO dbo.tblTreasuryAccount (
			companyId, storeId, treasuryAccountTypeId, vcAccountName,
			mCurrentBalance, btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.treasuryAccountId, INSERTED.companyId,
		       INSERTED.storeId, INSERTED.vcAccountName, INSERTED.mCurrentBalance
		VALUES (
			@companyId, @storeId, @treasuryAccountTypeId, LTRIM(RTRIM(@vcAccountName)),
			@mCurrentBalance, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_CreateUser] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  2. PROCÉDURES DE CRÉATION (Avec contrôle d'accès strict)
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_CreateUser
  Rôle : Création basique d'un utilisateur sans rôle spécifique.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_CreateUser]
    @vcLastName varchar(50), @vcPasswordHash varchar(255), @genderId int = NULL,
    @vcFirstName varchar(50) = NULL, @vcEmail varchar(100) = NULL, @vcPhoneNumber varchar(20) = NULL,
    @vcAddress varchar(150) = NULL, @vcPhotoUrl varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        -- Validations de base
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL THROW 51200, 'Le nom de famille est obligatoire.', 1;
        IF NULLIF(@vcPasswordHash, '') IS NULL THROW 51201, 'Le hash du mot de passe est obligatoire.', 1;
        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL THROW 51202, 'Un email ou un numéro de téléphone est obligatoire.', 1;
        IF @genderId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId) THROW 51203, 'Le genre indiqué est introuvable.', 1;

        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcPasswordHash, vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt, dtLastUpdated)
        OUTPUT INSERTED.userId, INSERTED.vcLastName, INSERTED.vcFirstName, INSERTED.genderId, INSERTED.vcEmail, INSERTED.vcPhoneNumber, INSERTED.vcAddress, INSERTED.vcPhotoUrl, INSERTED.btIsActive, INSERTED.dtCreatedAt
        VALUES (LTRIM(RTRIM(@vcLastName)), NULLIF(LTRIM(RTRIM(@vcFirstName)), ''), @genderId, LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')), NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''), @vcPasswordHash, NULLIF(LTRIM(RTRIM(@vcAddress)), ''), NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''), NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_DecideStockAdjustment] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Passe un ajustement PENDING vers APPROVED ou REJECTED. */
CREATE   PROCEDURE [dbo].[usp_DecideStockAdjustment]
	@stockAdjustmentId int,
	@adjustmentStatusId int,
	@approvedByUserId int,
	@vcApprovalComment varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		IF @approvedByUserId IS NULL OR @approvedByUserId <= 0
			THROW 52004, 'approvedByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblRefAdjustmentStatus
			WHERE adjustmentStatusId = @adjustmentStatusId AND vcCode IN ('APPROVED', 'REJECTED')
		)
			THROW 52008, 'La decision doit etre APPROVED ou REJECTED.', 1;

		UPDATE a
		SET adjustmentStatusId = @adjustmentStatusId,
			approvedByUserId = @approvedByUserId,
			dtApprovedAt = SYSUTCDATETIME(),
			vcApprovalComment = @vcApprovalComment
		OUTPUT INSERTED.stockAdjustmentId, INSERTED.adjustmentStatusId
		FROM dbo.tblStockAdjustment AS a
		WHERE a.stockAdjustmentId = @stockAdjustmentId
		  AND a.adjustmentStatusId = (
			SELECT adjustmentStatusId FROM dbo.tblRefAdjustmentStatus WHERE vcCode = 'PENDING'
		  );
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_FindUserByLoginIdentifier] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  3. AUTHENTIFICATION ET GESTION DE SESSION
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_FindUserByLoginIdentifier
  Rôle : Vérifie les identifiants (Email ou Téléphone) et retourne le hash pour 
         que Node.js puisse faire le bcrypt.compare().
  Sécurité : Utilise la vue d'autorisation pour s'assurer que le compte a un rôle 
             actif, SAUF pour le SuperAdmin qui est toujours reconnu.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_FindUserByLoginIdentifier]
    @vcEmail varchar(100), @vcPhoneNumber varchar(20)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL THROW 51204, 'L''identifiant email ou téléphone est obligatoire.', 1;

        -- Requête dynamique gérée selon l'existence de la colonne optionnelle btMustChangePassword
        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql
                N'SELECT TOP (1) u.userId, u.vcLastName, u.vcFirstName, u.genderId, u.vcEmail, u.vcPhoneNumber, u.vcPasswordHash, u.vcAddress, u.vcPhotoUrl, u.btIsActive, u.dtCreatedAt, CAST(ISNULL(u.btMustChangePassword, 0) AS bit) AS mustChangePassword
                  FROM dbo.tblUser AS u WHERE (LOWER(u.vcEmail) = LOWER(@email) OR u.vcPhoneNumber = @phone) AND EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope AS a WHERE a.userId = u.userId);',
                N'@email varchar(100), @phone varchar(20)', @email = @vcEmail, @phone = @vcPhoneNumber;
        END
        ELSE
        BEGIN
            SELECT TOP (1) u.userId, u.vcLastName, u.vcFirstName, u.genderId, u.vcEmail, u.vcPhoneNumber, u.vcPasswordHash, u.vcAddress, u.vcPhotoUrl, u.btIsActive, u.dtCreatedAt, CAST(CASE WHEN u.dtLastLoginAt IS NULL THEN 1 ELSE 0 END AS bit) AS mustChangePassword
            FROM dbo.tblUser AS u WHERE (LOWER(u.vcEmail) = LOWER(@vcEmail) OR u.vcPhoneNumber = @vcPhoneNumber) AND EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope AS a WHERE a.userId = u.userId);
        END;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetAllReferences] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Retourne toutes les lignes d'une cle de reference; filtre btEnabled si disponible. */
CREATE   PROCEDURE [dbo].[usp_GetAllReferences]
	@refKey varchar(50)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		DECLARE @tableName sysname;
		DECLARE @hasEnabled bit;
		SELECT @tableName = tableName, @hasEnabled = hasEnabledColumn
		FROM dbo.vw_ReferenceTableCatalog
		WHERE refKey = @refKey;
		IF @tableName IS NULL
			THROW 52200, 'Cle de reference inconnue.', 1;

		DECLARE @statement nvarchar(max) = N'SELECT * FROM dbo.' + QUOTENAME(@tableName);
		IF @hasEnabled = 1 SET @statement += N' WHERE btEnabled = 1';
		EXEC sys.sp_executesql @statement;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetAuditLogs] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_GetAuditLogs]
    @companyId int = NULL,
    @storeId int = NULL,
    @userId int = NULL,
    @tableName sysname = NULL,
    @vcRecordId varchar(100) = NULL,
    @vcActionName varchar(100) = NULL,
    @dtStartDate datetime = NULL,
    @dtEndDate datetime = NULL,
    @page int = 1,
    @limit int = 50
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @page IS NULL OR @page < 1 SET @page = 1;
        -- @limit = 0 => export "tous les enregistrements" (bornÃ© Ã  5000)
        IF @limit IS NULL OR @limit < 0 SET @limit = 50;
        IF @limit > 5000 SET @limit = 5000;

        DECLARE @offset int = (@page - 1) * @limit;

        -- 1. DÃ©compte total (toutes pages confondues)
        SELECT COUNT(*) AS totalRows
        FROM dbo.vw_AuditLogDetails
        WHERE (@companyId IS NULL OR companyId = @companyId)
          AND (@storeId IS NULL OR storeId = @storeId)
          AND (@userId IS NULL OR userId = @userId)
          AND (@tableName IS NULL OR tableName = @tableName)
          AND (@vcRecordId IS NULL OR vcRecordId = @vcRecordId)
          AND (@vcActionName IS NULL OR vcActionName = @vcActionName)
          AND (@dtStartDate IS NULL OR dtCreatedAt >= @dtStartDate)
          AND (@dtEndDate IS NULL OR dtCreatedAt < @dtEndDate);

        -- 2. Page demandÃ©e (si @limit = 0 => tout, tri chronologique descendant)
        SELECT
            auditLogId, userId, userName, companyId, vcCompanyName,
            storeId, vcStoreName, vcActionName, tableName, vcRecordId,
            vcOldValuesJson, vcNewValuesJson, vcIpAddress, vcUserAgent, dtCreatedAt
        FROM dbo.vw_AuditLogDetails
        WHERE (@companyId IS NULL OR companyId = @companyId)
          AND (@storeId IS NULL OR storeId = @storeId)
          AND (@userId IS NULL OR userId = @userId)
          AND (@tableName IS NULL OR tableName = @tableName)
          AND (@vcRecordId IS NULL OR vcRecordId = @vcRecordId)
          AND (@vcActionName IS NULL OR vcActionName = @vcActionName)
          AND (@dtStartDate IS NULL OR dtCreatedAt >= @dtStartDate)
          AND (@dtEndDate IS NULL OR dtCreatedAt < @dtEndDate)
        ORDER BY dtCreatedAt DESC, auditLogId DESC
        OFFSET CASE WHEN @limit = 0 THEN 0 ELSE @offset END ROWS
        FETCH NEXT CASE WHEN @limit = 0 THEN 5000 ELSE @limit END ROWS ONLY;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetCashReportById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_GetCashReportById]
	@cashReportId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashReportId IS NULL OR @cashReportId<=0 THROW 53212, 'cashReportId invalide.', 1;
		SELECT * FROM dbo.vw_CashReportDetails WHERE cashReportId=@cashReportId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetCashReportsBySession] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_GetCashReportsBySession]
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId<=0 THROW 53200, 'cashSessionId invalide.', 1;
		SELECT * FROM dbo.vw_CashReportDetails
		WHERE cashSessionId=@cashSessionId
		ORDER BY dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetCashReportsFiltered] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Liste filtree des rapports (boutique / gerant / dates) pour l'administration. */
CREATE   PROCEDURE [dbo].[usp_GetCashReportsFiltered]
	@storeId int = NULL,
	@gerantId int = NULL,
	@startDate datetime = NULL,
	@endDate datetime = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT cr.*, st.vcCode AS statusCode, st.vcCashReportStatus,
			cs.userId AS sessionUserId,
			RTRIM(LTRIM(u.vcLastName + ' ' + ISNULL(u.vcFirstName, ''))) AS sessionUserName
		FROM dbo.tblCashReport cr
		INNER JOIN dbo.tblRefCashReportStatus st ON cr.cashReportStatusId = st.cashReportStatusId
		INNER JOIN dbo.tblCashSession cs ON cr.cashSessionId = cs.cashSessionId
		INNER JOIN dbo.tblCashRegister r ON cs.cashRegisterId = r.cashRegisterId
		LEFT JOIN dbo.tblUser u ON cs.userId = u.userId
		WHERE (@storeId IS NULL OR r.storeId = @storeId)
		  AND (@gerantId IS NULL OR cs.userId = @gerantId)
		  AND (@startDate IS NULL OR cr.dtCreatedAt >= @startDate)
		  AND (@endDate IS NULL OR cr.dtCreatedAt <= @endDate)
		ORDER BY cr.dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetDeletedUsers] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[usp_GetDeletedUsers]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        vd.userId, vd.vcLastName, vd.vcFirstName, vd.vcFullName, vd.vcEmail,
        vd.vcPhoneNumber, vd.btIsActive, vd.dtCreatedAt,
        COALESCE(g.roleCode, a.roleCode, 'PENDING') AS roleCode
    FROM dbo.vw_UserDetails vd
    OUTER APPLY (
        SELECT TOP 1 r.vcCode AS roleCode
        FROM dbo.tblUserCompany uc
        INNER JOIN dbo.tblRefRole r ON r.roleId = uc.roleId
        WHERE uc.userId = vd.userId AND uc.btEnabled = 1
          AND uc.companyId IS NULL AND r.vcCode = 'SUPER_ADMIN'
    ) g
    OUTER APPLY (
        SELECT TOP 1 ac.roleCode
        FROM dbo.vw_UserAssignmentContext ac
        WHERE ac.userId = vd.userId
        ORDER BY CASE ac.scopeType WHEN 'COMPANY' THEN 0 ELSE 1 END,
                 CASE ac.roleCode WHEN 'ADMIN' THEN 0 WHEN 'MANAGER' THEN 1 WHEN 'CASHIER' THEN 2 ELSE 3 END
    ) a
    WHERE vd.btIsActive = 0
    ORDER BY vd.dtCreatedAt DESC;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetPendingAdminRegistrations] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_GetPendingAdminRegistrations
  Rôle : Liste les demandes en attente pour le tableau de bord du SuperAdmin.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_GetPendingAdminRegistrations]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        r.registrationRequestId, u.userId, u.vcLastName, u.vcFirstName, u.vcEmail, u.vcPhoneNumber,
        c.companyId, c.vcCompanyCode, c.vcCompanyName, r.dtRequestedAt
    FROM dbo.tblAdminRegistrationRequest r
    INNER JOIN dbo.tblUser u ON u.userId = r.userId
    INNER JOIN dbo.tblCompany c ON c.companyId = r.companyId
    INNER JOIN dbo.tblRefRegistrationRequestStatus s ON s.registrationRequestStatusId = r.registrationRequestStatusId
    WHERE s.vcCode = 'PENDING' AND r.btEnabled = 1
    ORDER BY r.dtRequestedAt ASC;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetPurchaseDetails] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_GetPurchaseDetails]
	@purchaseId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @purchaseId IS NULL OR @purchaseId <= 0 THROW 52305, 'purchaseId invalide.', 1;
		SELECT * FROM dbo.vw_PurchaseLineDetails
		WHERE purchaseId = @purchaseId
		ORDER BY purchaseDetailId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetPurchasesByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Achats actifs d'une boutique. */
CREATE   PROCEDURE [dbo].[usp_GetPurchasesByStore]
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 52301, 'storeId invalide.', 1;
		SELECT purchaseId, vcPurchaseNumber, supplierId, supplierName, storeId,
			purchaseStatusId, statusCode, vcPurchaseStatus, dtOrderAt, dtReceivedAt,
			mTotalAmount, createdByUserId, receivedByUserId
		FROM dbo.vw_PurchaseDetails
		WHERE storeId = @storeId AND btEnabled = 1
		ORDER BY dtOrderAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetReferenceByCode] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Retourne la premiere ligne correspondant exactement a vcCode, meme inactive. */
CREATE   PROCEDURE [dbo].[usp_GetReferenceByCode]
	@refKey varchar(50),
	@vcCode varchar(50)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcCode)), '') IS NULL
			RETURN;

		DECLARE @tableName sysname;
		SELECT @tableName = tableName
		FROM dbo.vw_ReferenceTableCatalog
		WHERE refKey = @refKey;
		IF @tableName IS NULL
			THROW 52200, 'Cle de reference inconnue.', 1;

		-- CORRECTION ICI : On stocke le code nettoyé dans une variable d'abord
		DECLARE @cleanCode varchar(50) = LTRIM(RTRIM(@vcCode));
		
		DECLARE @statement nvarchar(max) =
			N'SELECT TOP (1) * FROM dbo.' + QUOTENAME(@tableName) + N' WHERE vcCode = @code;';
		
		-- On passe la variable propre au lieu de la fonction
		EXEC sys.sp_executesql @statement, N'@code varchar(50)', @code = @cleanCode;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetStockAdjustmentDetails] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Details d'un ajustement. */
CREATE   PROCEDURE [dbo].[usp_GetStockAdjustmentDetails]
	@stockAdjustmentId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		SELECT * FROM dbo.vw_StockAdjustmentLineDetails
		WHERE stockAdjustmentId = @stockAdjustmentId
		ORDER BY stockAdjustmentDetailId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetStockAdjustmentHeader] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Entete d'un ajustement, avec motif, statut et boutique. */
CREATE   PROCEDURE [dbo].[usp_GetStockAdjustmentHeader]
	@stockAdjustmentId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		SELECT * FROM dbo.vw_StockAdjustmentDetails
		WHERE stockAdjustmentId = @stockAdjustmentId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetStockAdjustmentsByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Ajustements d'une boutique, avec filtre de statut facultatif. */
CREATE   PROCEDURE [dbo].[usp_GetStockAdjustmentsByStore]
	@storeId int,
	@statusCode varchar(20) = NULL,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52000, 'storeId est obligatoire et doit etre positif.', 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 100;

		SELECT TOP (@limit) a.*
		FROM dbo.vw_StockAdjustmentDetails AS a
		WHERE a.storeId = @storeId AND (@statusCode IS NULL OR a.statusCode = @statusCode)
		ORDER BY a.dtcreatedAt DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetSuperAdminDashboardStats] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_GetSuperAdminDashboardStats]
    @companyId INT = NULL,
    @storeId INT = NULL,
    @range VARCHAR(20) = 'monthly'
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. RECORDSET 0 : COMPTEURS (Articles, Ventes, etc.)
    SELECT 
        (SELECT COUNT(DISTINCT productId) FROM dbo.tblStoreStock 
         WHERE (@storeId IS NULL OR storeId = @storeId) AND dcAvailableQuantity > 0) AS totalArticles,
        
        (SELECT COUNT(DISTINCT productId) FROM dbo.tblStoreStock 
         WHERE (@storeId IS NULL OR storeId = @storeId) AND dcAvailableQuantity > 0 AND dcAvailableQuantity <= 10) AS articlesPeuStock,
        
        (SELECT COUNT(saleId) FROM dbo.tblSale 
         WHERE (@storeId IS NULL OR storeId = @storeId) AND CAST(dtSoldAt AS DATE) = CAST(GETDATE() AS DATE) AND IsCancelled = 0) AS ventesAujourdhui,
        
        (SELECT ISNULL(SUM(mNetAmount), 0) FROM dbo.tblSale 
         WHERE (@storeId IS NULL OR storeId = @storeId) AND CAST(dtSoldAt AS DATE) = CAST(GETDATE() AS DATE) AND IsCancelled = 0) AS revenuAujourdhui,
        
        (SELECT ISNULL(SUM(mNetAmount), 0) FROM dbo.tblSale 
         WHERE (@storeId IS NULL OR storeId = @storeId) AND IsCancelled = 0) AS totalCA,
        
        (SELECT ISNULL(SUM(mAmount), 0) FROM dbo.tblExpense 
         WHERE (@storeId IS NULL OR storeId = @storeId)) AS totalDepenses;

    -- 2. RECORDSET 1 : Ventes détaillées
    SELECT '[]' AS detailedSales;

    -- 3. RECORDSET 2 : ÉVOLUTION DES REVENUS (Le vrai calcul !)
    DECLARE @CurrentYear INT = YEAR(GETDATE());
    DECLARE @Categories NVARCHAR(MAX) = '["Jan","Fev","Mar","Avr","Mai","Juin","Juil","Aou","Sep","Oct","Nov","Dec"]';
    DECLARE @SeriesData NVARCHAR(MAX);

    WITH Months AS (
        SELECT 1 AS m UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 
        UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
    ),
    Revenue AS (
        SELECT 
            m.m,
            ISNULL(SUM(s.mNetAmount), 0) AS total
        FROM Months m
        LEFT JOIN dbo.tblSale s ON MONTH(s.dtSoldAt) = m.m 
            AND YEAR(s.dtSoldAt) = @CurrentYear
            AND (@storeId IS NULL OR s.storeId = @storeId)
            AND s.IsCancelled = 0
        GROUP BY m.m
    )
    -- On concatène les totaux pour former un tableau JSON [0, 5000, 0...]
    SELECT @SeriesData = '[' + STRING_AGG(CAST(total AS VARCHAR(50)), ',') WITHIN GROUP (ORDER BY m) + ']'
    FROM Revenue;

    -- On renvoie le JSON formaté exactement comme React l'attend
    DECLARE @FinalJson NVARCHAR(MAX) = '{"categories":' + @Categories + ',"series":[{"name":"Ventes","data":' + @SeriesData + '}]}';
    SELECT @FinalJson AS salesProfit;

    -- 4. RECORDSET 3 : Top Articles Vendus
    SELECT (
        SELECT TOP 5 
            p.vcProductName AS label, 
            CAST(SUM(sd.dcQuantity) AS INT) AS value
        FROM dbo.tblSaleDetail sd
        INNER JOIN dbo.tblSale s ON s.saleId = sd.saleId
        INNER JOIN dbo.tblProduct p ON p.productId = sd.productId
        WHERE (@storeId IS NULL OR s.storeId = @storeId) AND s.IsCancelled = 0
        GROUP BY p.vcProductName
        FOR JSON PATH
    ) AS productSales;

    -- 5. RECORDSET 4 & 5 : Performances (Tableaux vides)
    SELECT '[]' AS performanceBoutiques;
    SELECT '[]' AS performanceGerants;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetTreasuryAccounts] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_GetTreasuryAccounts
  Rôle : Liste tous les comptes d'une entreprise spécifique.
         (Retourne aussi les comptes désactivés pour l'historique).
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_GetTreasuryAccounts]
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51300, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			treasuryAccountId, companyId, storeId, typeCode,
			vcTreasuryAccountType, vcAccountName, mCurrentBalance, btEnabled
		FROM dbo.vw_TreasuryAccountDetails
		WHERE companyId = @companyId
		ORDER BY vcAccountName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetTreasuryMovements] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_GetTreasuryMovements
  Rôle : Récupère l'historique des N derniers mouvements d'un compte.
  Note : Limité à 1000 par défaut pour éviter de saturer la mémoire.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_GetTreasuryMovements]
	@treasuryAccountId int,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @treasuryAccountId IS NULL OR @treasuryAccountId <= 0
			THROW 51304, 'treasuryAccountId est obligatoire et doit etre positif.', 1;
		
		-- Sécurité sur la limite
		IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 100;

		SELECT TOP (@limit)
			treasuryMovementId, treasuryAccountId, typeCode,
			vcTreasuryMovementType, direction, cashReportId,
			mAmount, mBalanceBefore, mBalanceAfter, vcDescription,
			OperatedByUserId, operatedByName, dtCreatedAt
		FROM dbo.vw_TreasuryMovementDetails
		WHERE treasuryAccountId = @treasuryAccountId
		ORDER BY dtCreatedAt DESC, treasuryMovementId DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetUserById] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_GetUserById
  Rôle : Récupère les infos d'un utilisateur pour le Frontend (sans le hash !).
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_GetUserById]
    @userId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql N'SELECT userId, vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt, dtLastUpdated, CAST(ISNULL(btMustChangePassword, 0) AS bit) AS mustChangePassword FROM dbo.tblUser WHERE userId = @id;', N'@id int', @id = @userId;
        END
        ELSE
        BEGIN
            SELECT userId, vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt, dtLastUpdated, CAST(CASE WHEN dtLastLoginAt IS NULL THEN 1 ELSE 0 END AS bit) AS mustChangePassword FROM dbo.tblUser WHERE userId = @userId;
        END;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_GetUserContext] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_GetUserContext
  Rôle : Renvoie les 3 niveaux de contexte d'un utilisateur (Entreprises, Boutiques, SuperAdmin).
         Utilisé par Node.js pour construire le payload du Token JWT.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_GetUserContext]
    @userId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        
        -- 1. Liste des entreprises
        SELECT assignmentId AS userCompanyId, companyId, vcCompanyName, roleId, roleCode AS companyRoleCode FROM dbo.vw_UserAssignmentContext WHERE userId = @userId AND scopeType = 'COMPANY' ORDER BY assignedAt;
        
        -- 2. Liste des boutiques
        SELECT assignmentId AS userStoreId, storeId, vcStoreName, companyId, roleId, roleCode AS storeRoleCode FROM dbo.vw_UserAssignmentContext WHERE userId = @userId AND scopeType = 'STORE' ORDER BY assignedAt;
        
        -- 3. Rôle Global
        SELECT TOP (1) r.roleId, r.vcCode AS globalRoleCode FROM dbo.tblUserCompany AS uc INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId WHERE uc.userId = @userId AND uc.companyId IS NULL AND uc.btEnabled = 1 AND r.vcCode = 'SUPER_ADMIN';
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_ListStores] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[usp_ListStores]
    @companyId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        s.storeId, s.companyId, s.storeTypeId, t.vcCode AS storeTypeCode,
        t.vcStoreType, s.vcStoreCode, s.vcStoreName, s.vcAddress, s.vcCity,
        s.vcPhoneNumber, s.dcLatitude, s.dcLongitude, s.createdByUserId,
        s.btEnabled, s.dtCreatedAt, s.dtLastUpdated,
        c.vcCompanyCode, c.vcCompanyName
    FROM dbo.tblStore AS s
    LEFT JOIN dbo.tblRefStoreType AS t ON t.storeTypeId = s.storeTypeId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
    WHERE s.btEnabled = 1
      AND (@companyId IS NULL OR s.companyId = @companyId)
    ORDER BY s.vcStoreName;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_ListUsers] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_ListUsers]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        vd.userId, vd.vcLastName, vd.vcFirstName, vd.vcFullName, vd.vcEmail,
        vd.vcPhoneNumber, vd.btIsActive, vd.dtCreatedAt,
        COALESCE(g.roleCode, a.roleCode) AS roleCode
    FROM dbo.vw_UserDetails vd
    -- PÃ©rimÃ¨tre GLOBAL (SuperAdmin) : companyId IS NULL, absent de vw_UserAssignmentContext.
    OUTER APPLY (
        SELECT TOP 1 r.vcCode AS roleCode
        FROM dbo.tblUserCompany uc
        INNER JOIN dbo.tblRefRole r ON r.roleId = uc.roleId
        WHERE uc.userId = vd.userId AND uc.btEnabled = 1
          AND uc.companyId IS NULL AND r.vcCode = 'SUPER_ADMIN'
    ) g
    -- PÃ©rimÃ¨tre ENTREPRISE/BOUTIQUE : ne dÃ©pend pas du btIsActive du compte, afin que
    -- les Admins en attente de validation restent identifiables comme 'ADMIN'.
    OUTER APPLY (
        SELECT TOP 1 ac.roleCode
        FROM dbo.vw_UserAssignmentContext ac
        WHERE ac.userId = vd.userId
        ORDER BY
            CASE ac.scopeType WHEN 'COMPANY' THEN 0 ELSE 1 END,
            CASE ac.roleCode WHEN 'ADMIN' THEN 0 WHEN 'MANAGER' THEN 1 WHEN 'CASHIER' THEN 2 ELSE 3 END
    ) a
    ORDER BY vd.vcLastName, vd.vcFirstName;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_ListUsersByCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_ListUsersByCompany]
    @companyId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT
        vd.userId, 
        vd.vcLastName, 
        vd.vcFirstName, 
        vd.vcFullName, 
        vd.vcEmail,
        vd.vcPhoneNumber, 
        vd.btIsActive, 
        vd.dtCreatedAt,
        a.roleCode,
        a.storeId,
        a.vcStoreName AS boutiqueNom
    FROM dbo.vw_UserDetails vd
    -- On utilise INNER APPLY (au lieu de OUTER) pour ne garder QUE les utilisateurs 
    -- qui ont une affectation dans cette entreprise.
    CROSS APPLY (
        SELECT TOP 1 ac.roleCode, ac.storeId, ac.vcStoreName
        FROM dbo.vw_UserAssignmentContext ac
        WHERE ac.userId = vd.userId 
          AND ac.companyId = @companyId -- ✅ Filtre strict sur l'entreprise
          AND ac.roleCode IN ('ADMIN', 'MANAGER', 'CASHIER') -- ✅ Sécurité : on exclut SUPER_ADMIN
        ORDER BY CASE ac.scopeType WHEN 'COMPANY' THEN 0 ELSE 1 END,
                 CASE ac.roleCode WHEN 'ADMIN' THEN 0 WHEN 'MANAGER' THEN 1 WHEN 'CASHIER' THEN 2 ELSE 3 END
    ) a
    ORDER BY vd.vcLastName, vd.vcFirstName;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_ListUsersByStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_ListUsersByStore]
    @storeId INT,
    @requestedByUserId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- On récupère tous les utilisateurs actifs affectés à cette boutique
    SELECT 
        us.userStoreId,
        us.userId,
        u.vcLastName,
        u.vcFirstName,
        u.vcEmail,
        u.vcPhoneNumber,
        us.roleId,
        r.vcCode AS roleCode,
        r.vcRole AS roleName,
        us.dtStartDate,
        us.btEnabled
    FROM dbo.tblUserStore us
    INNER JOIN dbo.tblUser u ON u.userId = us.userId
    INNER JOIN dbo.tblRefRole r ON r.roleId = us.roleId
    WHERE us.storeId = @storeId 
      AND us.btEnabled = 1 
      AND us.dtEndDate IS NULL;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_ProcessAdminRegistration] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_ProcessAdminRegistration]
    @registrationRequestId INT, @superAdminUserId INT, @isApproved BIT, @vcRejectionReason VARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @superAdminUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
            THROW 51001, 'Seul un SuperAdmin peut valider une inscription.', 1;

        DECLARE @userId INT, @companyId INT, @companyName VARCHAR(50);
        SELECT @userId = r.userId, @companyId = r.companyId, @companyName = c.vcCompanyName
        FROM dbo.tblAdminRegistrationRequest r
        INNER JOIN dbo.tblCompany c ON c.companyId = r.companyId
        WHERE r.registrationRequestId = @registrationRequestId AND r.btEnabled = 1;
        
        IF @userId IS NULL THROW 51002, 'Demande introuvable ou déjà traitée.', 1;

        BEGIN TRANSACTION;
        IF @isApproved = 1
        BEGIN
            DECLARE @statusApprovedId INT = (SELECT registrationRequestStatusId FROM dbo.tblRefRegistrationRequestStatus WHERE vcCode = 'APPROVED');
            UPDATE dbo.tblAdminRegistrationRequest SET registrationRequestStatusId = @statusApprovedId, dtProcessedAt = GETDATE(), processedByUserId = @superAdminUserId WHERE registrationRequestId = @registrationRequestId;
            UPDATE dbo.tblUser SET btIsActive = 1, dtLastUpdated = GETDATE() WHERE userId = @userId;

            -- 1. Rôle ADMIN sur l'entreprise
            DECLARE @roleAdminId INT = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'ADMIN');
            INSERT INTO dbo.tblUserCompany (userId, companyId, roleId, createdByUserId, dtAssignedAt, btEnabled)
            VALUES (@userId, @companyId, @roleAdminId, @superAdminUserId, GETDATE(), 1);

            -- 2. Création de la Boutique Principale
            DECLARE @storeTypeId INT = (SELECT TOP 1 storeTypeId FROM dbo.tblRefStoreType WHERE vcCode = 'STORE');
            IF @storeTypeId IS NULL SET @storeTypeId = (SELECT TOP 1 storeTypeId FROM dbo.tblRefStoreType);

            DECLARE @storeCode VARCHAR(20) = CONCAT('B', @companyId);
            DECLARE @storeName VARCHAR(50) = CONCAT('Boutique ', @companyName);

            INSERT INTO dbo.tblStore (companyId, storeTypeId, vcStoreCode, vcStoreName, createdByUserId, btEnabled, dtCreatedAt, dtLastUpdated)
            VALUES (@companyId, @storeTypeId, @storeCode, @storeName, @userId, 1, GETDATE(), GETDATE());
            
            DECLARE @newStoreId INT = SCOPE_IDENTITY();

            -- 3. ✅ NOUVEAU : Liaison de l'Admin à sa boutique principale
            DECLARE @roleManagerId INT = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'MANAGER');
            INSERT INTO dbo.tblUserStore (userId, storeId, roleId, assignedByUserId, dtStartDate, btEnabled)
            VALUES (@userId, @newStoreId, @roleManagerId, @superAdminUserId, GETDATE(), 1);

            SELECT 'Demande approuvée. Le compte Admin, son entreprise et sa boutique principale sont créés.' AS Message;
        END
        ELSE
        BEGIN
            DECLARE @statusRejectedId INT = (SELECT registrationRequestStatusId FROM dbo.tblRefRegistrationRequestStatus WHERE vcCode = 'REJECTED');
            UPDATE dbo.tblAdminRegistrationRequest SET registrationRequestStatusId = @statusRejectedId, dtProcessedAt = GETDATE(), processedByUserId = @superAdminUserId, vcRejectionReason = @vcRejectionReason WHERE registrationRequestId = @registrationRequestId;
            SELECT 'Demande rejetée.' AS Message;
        END
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_ReceivePurchase] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* Reception partielle/complete: details, lots, mouvements et total sont atomiques. */
CREATE   PROCEDURE [dbo].[usp_ReceivePurchase]
	@purchaseId int,
	@receivedByUserId int,
	@partialStatusId int,
	@receivedStatusId int,
	@purchaseReceiptMovementTypeId int,
	@receptions dbo.PurchaseReceptionInputType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @purchaseId IS NULL OR @purchaseId <= 0 THROW 52305, 'purchaseId invalide.', 1;
		IF @receivedByUserId IS NULL OR @receivedByUserId <= 0 THROW 52302, 'receivedByUserId invalide.', 1;
		IF NOT EXISTS (SELECT 1 FROM @receptions) THROW 52306, 'Aucune ligne de reception fournie.', 1;
		IF EXISTS (SELECT 1 FROM @receptions WHERE dcQuantity < 0) THROW 52307, 'La quantite recue ne peut pas etre negative.', 1;

		BEGIN TRANSACTION;
		DECLARE @storeId int, @purchaseNumber varchar(30), @statusCode varchar(50);
		SELECT @storeId=p.storeId, @purchaseNumber=p.vcPurchaseNumber, @statusCode=rs.vcCode
		FROM dbo.tblPurchase AS p WITH (UPDLOCK,HOLDLOCK)
		INNER JOIN dbo.tblRefPurchaseStatus AS rs ON rs.purchaseStatusId=p.purchaseStatusId
		WHERE p.purchaseId=@purchaseId;
		IF @storeId IS NULL THROW 52308, 'Achat introuvable.', 1;
		IF @statusCode IN ('RECEIVED','CANCELLED') THROW 52309, 'Cet achat ne peut plus etre receptionne.', 1;

		IF EXISTS (
			SELECT 1 FROM @receptions AS r
			LEFT JOIN dbo.tblPurchaseDetail AS d WITH (UPDLOCK,HOLDLOCK)
				ON d.purchaseDetailId=r.purchaseDetailId AND d.purchaseId=@purchaseId
			WHERE d.purchaseDetailId IS NULL
		)
			THROW 52310, 'Une ligne de reception ne correspond pas a cet achat.', 1;
		IF EXISTS (
			SELECT 1 FROM @receptions AS r
			INNER JOIN dbo.tblPurchaseDetail AS d ON d.purchaseDetailId=r.purchaseDetailId
			WHERE d.dcReceivedQuantity+r.dcQuantity>d.dcOrderedQuantity
		)
			THROW 52311, 'La quantite recue depasse la quantite commandee.', 1;

		DECLARE @movementTypeCode varchar(50);
		SELECT @movementTypeCode=vcCode FROM dbo.tblRefStockMovementType
		WHERE stockMovementTypeId=@purchaseReceiptMovementTypeId;
		IF @movementTypeCode IS NULL OR @movementTypeCode<>'PURCHASE_RECEIPT'
			THROW 52312, 'Type PURCHASE_RECEIPT introuvable ou invalide.', 1;

		-- CORRECTION : Suppression de stockLotId de @updated
		DECLARE @updated table (
			purchaseDetailId int,
			productId bigint,
			vcLotNumber varchar(30) NULL,
			dtExpirationAt date NULL,
			mUnitPurchasePrice money,
			dcQuantity decimal(18,3)
		);
		
		UPDATE d
		SET dcReceivedQuantity=d.dcReceivedQuantity+r.dcQuantity
		OUTPUT INSERTED.purchaseDetailId, INSERTED.productId, 
			INSERTED.vcLotNumber, INSERTED.dtExpirationAt, INSERTED.mUnitPurchasePrice,
			r.dcQuantity
		INTO @updated(purchaseDetailId,productId,vcLotNumber,dtExpirationAt,mUnitPurchasePrice,dcQuantity)
		FROM dbo.tblPurchaseDetail AS d
		INNER JOIN @receptions AS r ON r.purchaseDetailId=d.purchaseDetailId
		WHERE d.purchaseId=@purchaseId AND r.dcQuantity>0;

		-- CORRECTION : Suppression de stockLotId de @lots
		DECLARE @lots table(
			rowNumber int IDENTITY(1,1) PRIMARY KEY,
			productId bigint,
			vcLotNumber varchar(30) NULL,
			dtExpirationAt date NULL,
			mUnitPurchasePrice money,
			dcQuantity decimal(18,3)
		);
		
		INSERT INTO @lots(productId,vcLotNumber,dtExpirationAt,mUnitPurchasePrice,dcQuantity)
		SELECT productId,vcLotNumber,dtExpirationAt,mUnitPurchasePrice,dcQuantity FROM @updated;
		
		DECLARE @i int=1,@n int=(SELECT COUNT(*) FROM @lots),@productId bigint,@stockLotId int,@lotNumber varchar(30),@expiry date,@unitPrice money,@qty decimal(18,3);
		
		WHILE @i<=@n
		BEGIN
			-- CORRECTION : Initialisation à NULL et suppression de la récupération depuis @lots
			SET @stockLotId = NULL;
			
			SELECT @productId=productId,@lotNumber=vcLotNumber,@expiry=dtExpirationAt,@unitPrice=mUnitPurchasePrice,@qty=dcQuantity 
			FROM @lots WHERE rowNumber=@i;
			
			IF @lotNumber IS NOT NULL
			BEGIN
				SELECT @stockLotId=stockLotId FROM dbo.tblStockLot WITH (UPDLOCK,HOLDLOCK)
				WHERE storeId=@storeId AND productId=@productId AND vcLotNumber=@lotNumber;
				
				IF @stockLotId IS NULL
				BEGIN
					DECLARE @newLot table(stockLotId int);
					INSERT INTO dbo.tblStockLot(storeId,productId,vcLotNumber,dtManufacturingAt,dtExpirationAt,dcInitialQuantity,dcRemainingQuantity,mUnitPurchasePrice,dtReceivedAt,btEnabled)
					OUTPUT INSERTED.stockLotId INTO @newLot(stockLotId)
					VALUES(@storeId,@productId,@lotNumber,NULL,@expiry,@qty,@qty,@unitPrice,SYSUTCDATETIME(),1);
					SELECT @stockLotId=stockLotId FROM @newLot;
				END
				ELSE
					UPDATE dbo.tblStockLot SET dcInitialQuantity=dcInitialQuantity+@qty,dcRemainingQuantity=dcRemainingQuantity+@qty WHERE stockLotId=@stockLotId;
			END;

			DECLARE @stockBefore decimal(18,3),@stockAfter decimal(18,3);
			MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
			USING(SELECT @storeId AS storeId,@productId AS productId) AS source
			ON target.storeId=source.storeId AND target.productId=source.productId
			WHEN NOT MATCHED THEN INSERT(storeId,productId,dcAvailableQuantity,dcReservedQuantity,dtUpdatedAt) VALUES(source.storeId,source.productId,0,0,SYSUTCDATETIME());
			SELECT @stockBefore=dcAvailableQuantity FROM dbo.tblStoreStock WITH(UPDLOCK,HOLDLOCK) WHERE storeId=@storeId AND productId=@productId;
			SET @stockAfter=@stockBefore+@qty;
			INSERT INTO dbo.tblStockMovement(storeId,productId,stockLotId,stockMovementTypeId,dcQuantity,dcStockBefore,dcStockAfter,vcReferenceType,referenceId,operatedByUserId,dtMovementAt,vcComment)
			VALUES(@storeId,@productId,@stockLotId,@purchaseReceiptMovementTypeId,@qty,@stockBefore,@stockAfter,'PURCHASE',@purchaseId,@receivedByUserId,SYSUTCDATETIME(),CONCAT('Reception achat ',@purchaseNumber));
			UPDATE dbo.tblStoreStock SET dcAvailableQuantity=@stockAfter,dtUpdatedAt=SYSUTCDATETIME() WHERE storeId=@storeId AND productId=@productId;
			SET @i+=1;
		END;

		DECLARE @totalLines int,@completedLines int,@targetStatusId int,@targetCode varchar(20);
		SELECT @totalLines=COUNT(*),@completedLines=SUM(CASE WHEN dcReceivedQuantity>=dcOrderedQuantity THEN 1 ELSE 0 END)
		FROM dbo.tblPurchaseDetail WHERE purchaseId=@purchaseId;
		SET @targetCode=CASE WHEN @totalLines>0 AND @completedLines=@totalLines THEN 'RECEIVED' ELSE 'PARTIAL' END;
		SET @targetStatusId=CASE WHEN @targetCode='RECEIVED' THEN @receivedStatusId ELSE @partialStatusId END;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefPurchaseStatus WHERE purchaseStatusId=@targetStatusId AND vcCode=@targetCode)
			THROW 52313, 'Statut final de reception absent ou incoherent.', 1;
		UPDATE dbo.tblPurchase
		SET purchaseStatusId=@targetStatusId,
			receivedByUserId=@receivedByUserId,
			dtReceivedAt=CASE WHEN @targetCode='RECEIVED' THEN SYSUTCDATETIME() ELSE dtReceivedAt END,
			mTotalAmount=(SELECT COALESCE(SUM(dcReceivedQuantity*mUnitPurchasePrice),0) FROM dbo.tblPurchaseDetail WHERE purchaseId=@purchaseId),
			dtLastUpdated=SYSUTCDATETIME()
		WHERE purchaseId=@purchaseId;
		COMMIT TRANSACTION;
		SELECT @purchaseId AS purchaseId,@targetCode AS status;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_RecordTreasuryMovement] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_RecordTreasuryMovement
  Rôle : Enregistre une entrée ou une sortie d'argent sur un compte.
  
  Logique de sécurité (Transaction) :
    1. On bloque la ligne du compte (UPDLOCK, HOLDLOCK) pour éviter que deux 
       utilisateurs modifient le solde en même temps (problème de concurrence).
    2. On calcule le nouveau solde.
    3. On insère le mouvement.
    4. On met à jour le solde du compte.
    5. Si une erreur survient, le ROLLBACK annule tout.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_RecordTreasuryMovement]
	@treasuryAccountId int,
	@treasuryMovementTypeId int,
	@cashReportId int = NULL,
	@mAmount money,
	@vcDescription varchar(150),
	@OperatedByUserId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		-- 1. Validations de base
		IF @treasuryAccountId IS NULL OR @treasuryAccountId <= 0
			THROW 51304, 'treasuryAccountId est obligatoire et doit etre positif.', 1;
		IF @treasuryMovementTypeId IS NULL OR @treasuryMovementTypeId <= 0
			THROW 51305, 'Le type de mouvement est obligatoire.', 1;
		IF @mAmount IS NULL OR @mAmount <= 0
			THROW 51306, 'mAmount doit etre strictement superieur a zero.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcDescription)), '') IS NULL
			THROW 51307, 'vcDescription est obligatoire.', 1;
		IF @OperatedByUserId IS NULL OR @OperatedByUserId <= 0
			THROW 51308, 'OperatedByUserId est obligatoire.', 1;

		-- 2. Récupération de la direction (+1 pour entrée, -1 pour sortie)
		DECLARE @direction smallint;
		SELECT @direction = direction
		FROM dbo.tblRefTreasuryMovementType
		WHERE treasuryMovementTypeId = @treasuryMovementTypeId;
		IF @direction IS NULL OR @direction NOT IN (-1, 1)
			THROW 51305, 'Type de mouvement absent ou direction invalide.', 1;

		-- 3. Début de la transaction sécurisée
		BEGIN TRANSACTION;

		DECLARE @balanceBefore money;
		-- On verrouille la ligne du compte pour empêcher toute modification simultanée
		SELECT @balanceBefore = mCurrentBalance
		FROM dbo.tblTreasuryAccount WITH (UPDLOCK, HOLDLOCK)
		WHERE treasuryAccountId = @treasuryAccountId;
		
		IF @balanceBefore IS NULL
			THROW 51309, 'Compte de tresorerie introuvable.', 1;

		-- Calcul du nouveau solde
		DECLARE @balanceAfter money = @balanceBefore + (@direction * @mAmount);
		
		-- Table temporaire pour stocker l'ID généré et le renvoyer à l'API
		DECLARE @inserted table (
			treasuryMovementId int,
			mBalanceAfter money
		);

		-- 4. Insertion du mouvement
		INSERT INTO dbo.tblTreasuryMovement (
			treasuryAccountId, treasuryMovementTypeId, cashReportId,
			mAmount, mBalanceBefore, mBalanceAfter, vcDescription,
			OperatedByUserId, btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.treasuryMovementId, INSERTED.mBalanceAfter
			INTO @inserted (treasuryMovementId, mBalanceAfter)
		VALUES (
			@treasuryAccountId, @treasuryMovementTypeId, @cashReportId,
			@mAmount, @balanceBefore, @balanceAfter, LTRIM(RTRIM(@vcDescription)),
			@OperatedByUserId, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		-- 5. Mise à jour du solde du compte
		UPDATE dbo.tblTreasuryAccount
		SET mCurrentBalance = @balanceAfter,
			dtLastUpdated = SYSUTCDATETIME()
		WHERE treasuryAccountId = @treasuryAccountId;

		-- 6. Validation de la transaction
		COMMIT TRANSACTION;
		
		-- Renvoi des données à l'API Node.js
		SELECT treasuryMovementId, mBalanceAfter FROM @inserted;
	END TRY
	BEGIN CATCH
		-- En cas d'erreur, on annule tout (le solde ne bouge pas)
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_RequestAdminRegistration] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  6. WORKFLOW D'INSCRIPTION (Demande d'adhésion d'une entreprise)
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_RequestAdminRegistration
  Rôle : Un utilisateur non connecté demande la création de son entreprise.
         Le compte est créé INACTIF (btIsActive = 0). Une demande PENDING est créée.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_RequestAdminRegistration]
    @vcLastName VARCHAR(50), @vcFirstName VARCHAR(50), @vcEmail VARCHAR(100), @vcPhoneNumber VARCHAR(20),
    @vcPasswordHash VARCHAR(255), @vcCompanyCode VARCHAR(20), @vcCompanyName VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcEmail = @vcEmail) THROW 51000, 'Un compte avec cet email existe déjà.', 1;
        IF EXISTS (SELECT 1 FROM dbo.tblCompany WHERE vcCompanyCode = @vcCompanyCode) THROW 51003, 'Ce code entreprise est déjà utilisé.', 1;

        BEGIN TRANSACTION;
        -- 1. Créer l'entreprise
        INSERT INTO dbo.tblCompany (vcCompanyCode, vcCompanyName, btEnabled, dtCreatedAt, dtLastUpdated)
        VALUES (@vcCompanyCode, @vcCompanyName, 1, GETDATE(), GETDATE());
        DECLARE @companyId INT = SCOPE_IDENTITY();

        -- 2. Créer l'utilisateur INACTIF
        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, vcEmail, vcPhoneNumber, vcPasswordHash, btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES (@vcLastName, @vcFirstName, @vcEmail, @vcPhoneNumber, @vcPasswordHash, 0, GETDATE(), GETDATE());
        DECLARE @userId INT = SCOPE_IDENTITY();

        -- 3. Demande PENDING
        DECLARE @statusPendingId INT = (SELECT registrationRequestStatusId FROM dbo.tblRefRegistrationRequestStatus WHERE vcCode = 'PENDING');
        INSERT INTO dbo.tblAdminRegistrationRequest (userId, companyId, registrationRequestStatusId, dtRequestedAt, btEnabled)
        VALUES (@userId, @companyId, @statusPendingId, GETDATE(), 1);

        COMMIT TRANSACTION;
        SELECT @userId AS userId, 'Demande envoyée. En attente de validation par le SuperAdmin.' AS Message;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_RevokeUserCompany] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_RevokeUserCompany]
    @userCompanyId bigint, @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @requestedByUserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @requestedByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') THROW 51260, 'Réservé au SuperAdmin.', 1;
        UPDATE dbo.tblUserCompany SET btEnabled = 0, dtEndedAt = SYSUTCDATETIME() WHERE userCompanyId = @userCompanyId AND btEnabled = 1;
        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_RevokeUserStore] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   PROCEDURE [dbo].[usp_RevokeUserStore]
    @userStoreId bigint, @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @targetUserId int, @storeId int, @companyId int, @targetRoleCode varchar(50);
        SELECT @targetUserId = us.userId, @storeId = us.storeId, @companyId = s.companyId, @targetRoleCode = r.vcCode
        FROM dbo.tblUserStore AS us INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
        WHERE us.userStoreId = @userStoreId AND us.btEnabled = 1;
        
        UPDATE dbo.tblUserStore SET btEnabled = 0, dtEndDate = SYSUTCDATETIME() WHERE userStoreId = @userStoreId AND btEnabled = 1;
        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_SetMustChangePassword] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_SetMustChangePassword
  Rôle : Force l'utilisateur à changer son mot de passe à la prochaine connexion.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_SetMustChangePassword]
    @userId int, @required bit
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        DECLARE @rowsAffected int = 0;
        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql N'UPDATE dbo.tblUser SET btMustChangePassword = @flag, dtLastUpdated = SYSUTCDATETIME() WHERE userId = @id; SET @rows = @@ROWCOUNT;', N'@id int, @flag bit, @rows int OUTPUT', @id = @userId, @flag = @required, @rows = @rowsAffected OUTPUT;
        END;
        SELECT @rowsAffected AS rowsAffected;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_SetUserActive] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*==============================================================================
  4. ACTIVATION, DÉSACTIVATION ET MODIFICATION
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_SetUserActive
  Rôle : Active ou désactive un compte.
  Sécurité : Empêche l'auto-désactivation. Empêche la désactivation du SuperAdmin 
             par un non-SuperAdmin.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_SetUserActive]
    @userId int, @btIsActive bit, @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        IF @requestedByUserId IS NOT NULL AND @requestedByUserId = @userId AND @btIsActive = 0 THROW 51280, 'Auto-désactivation interdite.', 1;
        IF @btIsActive = 0 AND EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @userId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') AND (@requestedByUserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @requestedByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')) THROW 51281, 'Compte SuperAdmin protégé.', 1;
        
        UPDATE dbo.tblUser SET btIsActive = @btIsActive, dtLastUpdated = SYSUTCDATETIME() OUTPUT INSERTED.userId, INSERTED.vcEmail, INSERTED.btIsActive WHERE userId = @userId;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_UpdateUser] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_UpdateUser
  Rôle : Mise à jour partielle (les champs NULL sont ignorés grâce à COALESCE).
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_UpdateUser]
    @userId int, @vcLastName varchar(50) = NULL, @vcFirstName varchar(50) = NULL, @genderId int = NULL,
    @vcEmail varchar(100) = NULL, @vcPhoneNumber varchar(20) = NULL, @vcAddress varchar(150) = NULL,
    @vcPhotoUrl varchar(255) = NULL, @vcPasswordHash varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        IF @genderId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId) THROW 51203, 'Le genre indiqué est introuvable.', 1;
        IF @vcEmail IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail) AND userId <> @userId) THROW 51271, 'Email déjà utilisé.', 1;
        IF @vcPhoneNumber IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcPhoneNumber = @vcPhoneNumber AND userId <> @userId) THROW 51272, 'Téléphone déjà utilisé.', 1;
        
        UPDATE dbo.tblUser SET vcLastName = COALESCE(@vcLastName, vcLastName), vcFirstName = COALESCE(@vcFirstName, vcFirstName), genderId = CASE WHEN @genderId IS NOT NULL THEN @genderId ELSE genderId END, vcEmail = COALESCE(@vcEmail, vcEmail), vcPhoneNumber = COALESCE(@vcPhoneNumber, vcPhoneNumber), vcAddress = COALESCE(@vcAddress, vcAddress), vcPhotoUrl = COALESCE(@vcPhotoUrl, vcPhotoUrl), vcPasswordHash = COALESCE(@vcPasswordHash, vcPasswordHash), dtLastUpdated = SYSUTCDATETIME()
        OUTPUT INSERTED.userId, INSERTED.vcLastName, INSERTED.vcFirstName, INSERTED.vcEmail, INSERTED.vcPhoneNumber, INSERTED.dtLastUpdated WHERE userId = @userId;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
/****** Objet : StoredProcedure [dbo].[usp_UpdateUserLastLogin] Date de script : 19/11/2026 10:45:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*------------------------------------------------------------------------------
  usp_UpdateUserLastLogin
  Rôle : Met à jour la date de dernière connexion.
------------------------------------------------------------------------------*/
CREATE   PROCEDURE [dbo].[usp_UpdateUserLastLogin]
    @userId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        UPDATE dbo.tblUser SET dtLastLoginAt = SYSUTCDATETIME(), dtLastUpdated = SYSUTCDATETIME() WHERE userId = @userId;
        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO
