IF EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcEmail = 'test.validate@demo.com')
BEGIN
    DECLARE @sql NVARCHAR(MAX) = N'UPDATE dbo.tblUser SET vcPasswordHash = CONVERT(VARCHAR(MAX), CONVERT(XML, ''' + @b64 + N''')) WHERE vcEmail = ''test.validate@demo.com''';
    EXEC sp_executesql @sql, N'@b64 NVARCHAR(100)', @b64 = N'XC41bUNIQTM4WWxyd05UalJGSlc4bjRKMHc1Sw==';
    SELECT 'Password hash updated' AS status;
END
ELSE
BEGIN
    SELECT 'User not found' AS status;
END
