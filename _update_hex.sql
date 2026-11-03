IF EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcEmail = 'test.validate@demo.com')
BEGIN
    DECLARE @hash VARBINARY(MAX) = 0x;
    DECLARE @strHash VARCHAR(MAX) = CONVERT(VARCHAR(MAX), @hash, 1);
    UPDATE dbo.tblUser SET vcPasswordHash = @strHash WHERE vcEmail = 'test.validate@demo.com';
    SELECT 'Password hash updated' AS status;
END
ELSE
BEGIN
    SELECT 'User not found' AS status;
END
