/*
  Module notifications - SQL Server.
  Prerequis: dbo.tblNotification, dbo.tblRefNotificationType.
  Les filtres des procedures suivent le comportement actuel de notificationDAL.js.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Notifications avec les informations de leur type. */
CREATE OR ALTER VIEW dbo.vw_NotificationDetails
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

/* Cree une notification non lue et retour les champs attendus par le DAL. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateNotification
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

/* Notifications actives et non expirees d'un utilisateur. */
CREATE OR ALTER PROCEDURE dbo.sp_GetNotificationsByUser
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

/* Nombre de notifications non lues, actives et non expirees. */
CREATE OR ALTER PROCEDURE dbo.sp_CountUnreadNotifications
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

/* Marque une notification comme lue pour son proprietaire. */
CREATE OR ALTER PROCEDURE dbo.sp_MarkNotificationAsRead
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

/* Marque toutes les notifications non lues de l'utilisateur, conforme au DAL. */
CREATE OR ALTER PROCEDURE dbo.sp_MarkAllNotificationsAsRead
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

/* Desactivation logique d'une notification appartenant a l'utilisateur. */
CREATE OR ALTER PROCEDURE dbo.sp_DeleteNotification
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

/* Destinataires d'alerte d'une boutique : MANAGER + CASHIER (store) et ADMIN (entreprise
   rattachee a la boutique). Remplace la requete UNION inline de notificationService. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStoreAlertRecipients
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52605, 'storeId invalide.', 1;

		SELECT DISTINCT a.userId
		FROM dbo.vw_UserScopeAssignment AS a
		INNER JOIN dbo.tblUser AS u ON u.userId = a.userId AND u.btIsActive = 1
		WHERE a.storeId = @storeId
		  AND a.vcScopeType = 'STORE'
		  AND a.btIsActive = 1
		  AND a.vcRoleCode IN ('MANAGER', 'CASHIER')

		UNION

		SELECT DISTINCT a.userId
		FROM dbo.vw_UserScopeAssignment AS a
		INNER JOIN dbo.tblUser AS u ON u.userId = a.userId AND u.btIsActive = 1
		WHERE a.vcScopeType = 'COMPANY'
		  AND a.btIsActive = 1
		  AND a.vcRoleCode = 'ADMIN'
		  AND EXISTS (
			SELECT 1 FROM dbo.vw_UserScopeAssignment AS s
			WHERE s.companyId = a.companyId
			  AND s.storeId = @storeId
			  AND s.vcScopeType = 'STORE'
			  AND s.btIsActive = 1
		  );
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
