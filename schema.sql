-- This schema is for Microsoft SQL Server (MSSQL)

-- Create Roles Table
CREATE TABLE Roles (
    Id INT PRIMARY KEY IDENTITY(1,1),
    Name NVARCHAR(50) NOT NULL UNIQUE
);

-- Create Permissions Table (for screen access)
CREATE TABLE Permissions (
    Id INT PRIMARY KEY IDENTITY(1,1),
    ScreenName NVARCHAR(50) NOT NULL UNIQUE -- e.g., 'Dashboard', 'Tickets', 'User Management'
);

-- Create RolePermissions Table (Many-to-Many relationship)
CREATE TABLE RolePermissions (
    RoleId INT NOT NULL,
    PermissionId INT NOT NULL,
    PRIMARY KEY (RoleId, PermissionId),
    FOREIGN KEY (RoleId) REFERENCES Roles(Id) ON DELETE CASCADE,
    FOREIGN KEY (PermissionId) REFERENCES Permissions(Id) ON DELETE CASCADE
);

-- Create Users Table
CREATE TABLE Users (
    Id INT PRIMARY KEY IDENTITY(1,1),
    Name NVARCHAR(100) NOT NULL,
    Username NVARCHAR(50) NOT NULL UNIQUE,
    ContactEmail NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL, -- Store a hashed password, not plain text
    RoleId INT NOT NULL,
    FOREIGN KEY (RoleId) REFERENCES Roles(Id)
);

-- Create Tickets Table
CREATE TABLE Tickets (
    Id INT PRIMARY KEY IDENTITY(1,1),
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    Priority NVARCHAR(50) NOT NULL,
    Category NVARCHAR(50),
    SubCategory NVARCHAR(100),
    ReporterId INT NOT NULL,
    AssigneeId INT,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    ScreenshotUrl NVARCHAR(MAX),
    ScreenshotFileName NVARCHAR(255),
    FOREIGN KEY (ReporterId) REFERENCES Users(Id),
    FOREIGN KEY (AssigneeId) REFERENCES Users(Id)
);

-- Create Notifications Table
CREATE TABLE Notifications (
    Id INT PRIMARY KEY IDENTITY(1,1),
    UserId INT NOT NULL,
    TicketId INT,
    Message NVARCHAR(255) NOT NULL,
    IsRead BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE,
    FOREIGN KEY (TicketId) REFERENCES Tickets(Id)
);


-- Seed initial data (optional)
INSERT INTO Permissions (ScreenName) VALUES ('Dashboard'), ('Tickets'), ('User Management'), ('Reports');

-- Example of seeding roles (you would do this for all default roles)
-- This is a simplified example. In a real script, you'd get the IDs programmatically.
-- Assuming 'Dashboard' is ID 1, 'Tickets' is ID 2, 'User Management' is ID 3, 'Reports' is ID 4

INSERT INTO Roles (Name) VALUES ('Admin'), ('Manager'), ('Support Agent'), ('Employee');

-- Admin (Role ID 1) permissions
INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (1, 1), (1, 2), (1, 3), (1, 4);
-- Manager (Role ID 2) permissions
INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (2, 1), (2, 2);
-- Support Agent (Role ID 3) permissions
INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (3, 1), (3, 2);
-- Employee (Role ID 4) permissions
INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (4, 1), (4, 2);

-- Seed sample users
-- NOTE: Passwords are in plain text for demonstration purposes only.
-- In a real application, you MUST hash passwords using a strong algorithm like bcrypt.
INSERT INTO Users (Name, Username, ContactEmail, PasswordHash, RoleId) VALUES
('Admin User', 'admin', 'admin@ticketing.corp', 'password', 1),
('Manager User', 'manager', 'manager@ticketing.corp', 'password', 2),
('Support Agent', 'support', 'support@ticketing.corp', 'password', 3),
('Employee User', 'employee', 'employee@ticketing.corp', 'password', 4);

GO


-- ─────────────────────────────────────────────────────────────────────────────
-- Uathayam Ticketing System — MSSQL Schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE Roles (
    Id   INT PRIMARY KEY IDENTITY(1,1),
    Name NVARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE Permissions (
    Id         INT PRIMARY KEY IDENTITY(1,1),
    ScreenName NVARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE RolePermissions (
    RoleId       INT NOT NULL,
    PermissionId INT NOT NULL,
    PRIMARY KEY (RoleId, PermissionId),
    FOREIGN KEY (RoleId)       REFERENCES Roles(Id)       ON DELETE CASCADE,
    FOREIGN KEY (PermissionId) REFERENCES Permissions(Id) ON DELETE CASCADE
);

CREATE TABLE Users (
    Id           INT PRIMARY KEY IDENTITY(1,1),
    Name         NVARCHAR(100) NOT NULL,
    Username     NVARCHAR(50)  NOT NULL UNIQUE,
    ContactEmail NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,  -- bcrypt hash, never plain text
    RoleId       INT NOT NULL,
    FOREIGN KEY (RoleId) REFERENCES Roles(Id)
);

CREATE TABLE Tickets (
    Id                 INT PRIMARY KEY IDENTITY(1,1),
    Title              NVARCHAR(200) NOT NULL,
    Description        NVARCHAR(MAX) NOT NULL,
    Status             NVARCHAR(50)  NOT NULL,
    Priority           NVARCHAR(50)  NOT NULL,
    Category           NVARCHAR(50),
    SubCategory        NVARCHAR(100),
    Division           NVARCHAR(100),
    ReporterId         INT NOT NULL,
    AssigneeId         INT,
    CreatedAt          DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt          DATETIME2 NOT NULL DEFAULT GETDATE(),
    ScreenshotUrl      NVARCHAR(MAX),       -- Store object-storage URL, not base64
    ScreenshotFileName NVARCHAR(255),
    CreatedBy          NVARCHAR(100),
    EmployeeId         NVARCHAR(50),
    ExtensionNumber    NVARCHAR(20),
    FOREIGN KEY (ReporterId) REFERENCES Users(Id),
    FOREIGN KEY (AssigneeId) REFERENCES Users(Id)
);

-- Performance indexes for common query patterns
CREATE INDEX IX_Tickets_UpdatedAt   ON Tickets (UpdatedAt DESC);
CREATE INDEX IX_Tickets_Status      ON Tickets (Status);
CREATE INDEX IX_Tickets_Priority    ON Tickets (Priority);
CREATE INDEX IX_Tickets_AssigneeId  ON Tickets (AssigneeId);
CREATE INDEX IX_Tickets_ReporterId  ON Tickets (ReporterId);

CREATE TABLE Notifications (
    Id        INT PRIMARY KEY IDENTITY(1,1),
    UserId    INT NOT NULL,
    TicketId  INT,            -- SET NULL when ticket is deleted (not CASCADE)
    Message   NVARCHAR(255) NOT NULL,
    IsRead    BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (UserId)   REFERENCES Users(Id)   ON DELETE CASCADE,
    FOREIGN KEY (TicketId) REFERENCES Tickets(Id) ON DELETE SET NULL  -- ← was missing
);

CREATE INDEX IX_Notifications_UserId ON Notifications (UserId);

-- ─── Seed data ─────────────────────────────────────────────────────────────
INSERT INTO Permissions (ScreenName)
VALUES ('Dashboard'), ('Tickets'), ('User Management'), ('Reports'), ('Dispatch');

IF NOT EXISTS (SELECT 1 FROM Permissions WHERE ScreenName = 'Price Configuration')
BEGIN
    INSERT INTO Permissions (ScreenName) VALUES ('Price Configuration');
END;

IF OBJECT_ID('dbo.PriceItemMaster', 'U') IS NULL
BEGIN
    CREATE TABLE PriceItemMaster (
        Id INT PRIMARY KEY IDENTITY(1,1),
        NormalizedSku NVARCHAR(120) NOT NULL,
        SkuCode NVARCHAR(120) NOT NULL,
        ItemName NVARCHAR(255) NULL,
        Category NVARCHAR(120) NULL,
        Color NVARCHAR(120) NULL,
        Brand NVARCHAR(120) NULL,
        HsnCode NVARCHAR(60) NULL,
        Tat NVARCHAR(60) NULL,
        Size NVARCHAR(80) NULL,
        Weight NVARCHAR(80) NULL,
        CostPrice DECIMAL(18,2) NOT NULL DEFAULT 0,
        MRP DECIMAL(18,2) NOT NULL DEFAULT 0,
        BatchGroup NVARCHAR(120) NULL,
        EAN NVARCHAR(120) NULL,
        Dimensions NVARCHAR(120) NULL,
        TaxType NVARCHAR(80) NULL,
        Enabled NVARCHAR(40) NULL,
        ItemType NVARCHAR(80) NULL,
        Expirable NVARCHAR(40) NULL,
        SkuType NVARCHAR(80) NULL,
        Image NVARCHAR(500) NULL,
        PageUrl NVARCHAR(500) NULL,
        SourceFileName NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_PriceItemMaster_NormalizedSku UNIQUE (NormalizedSku)
    );

    CREATE INDEX IX_PriceItemMaster_SkuCode ON PriceItemMaster (SkuCode);
    CREATE INDEX IX_PriceItemMaster_ItemName ON PriceItemMaster (ItemName);
    CREATE INDEX IX_PriceItemMaster_BrandCategory ON PriceItemMaster (Brand, Category);
END;

IF OBJECT_ID('dbo.PriceItemMasterMeta', 'U') IS NULL
BEGIN
    CREATE TABLE PriceItemMasterMeta (
        Id INT PRIMARY KEY,
        LastUploadFileName NVARCHAR(255) NULL,
        LastUploadedAt DATETIME2 NULL,
        TotalItems INT NOT NULL DEFAULT 0,
        UpdatedBy INT NULL,
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_PriceItemMasterMeta_Users FOREIGN KEY (UpdatedBy) REFERENCES Users(Id)
    );
END;

IF COL_LENGTH('dbo.PriceConfigurations', 'ItemMasterUploadedAt') IS NULL
BEGIN
    ALTER TABLE PriceConfigurations
    ADD ItemMasterUploadedAt DATETIME2 NULL;
END;

IF OBJECT_ID('dbo.PriceConfigurations', 'U') IS NULL
BEGIN
    CREATE TABLE PriceConfigurations (
        Id INT PRIMARY KEY IDENTITY(1,1),
        ConfigurationNo NVARCHAR(30) NOT NULL,
        PickListNo NVARCHAR(100) NOT NULL,
        PickListCreatedAt NVARCHAR(100) NULL,
        ItemMasterFileName NVARCHAR(255) NULL,
        PickListFileName NVARCHAR(255) NULL,
        ItemsJson NVARCHAR(MAX) NOT NULL,
        LabelTemplateJson NVARCHAR(MAX) NULL,
        CreatedBy INT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_PriceConfigurations_ConfigurationNo UNIQUE (ConfigurationNo),
        CONSTRAINT FK_PriceConfigurations_Users FOREIGN KEY (CreatedBy) REFERENCES Users(Id)
    );

    CREATE INDEX IX_PriceConfigurations_UpdatedAt
    ON PriceConfigurations (UpdatedAt DESC, Id DESC);
END;
