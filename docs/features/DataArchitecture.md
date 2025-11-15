# CastBot Data Architecture

## Complete Data Management System

### Main Data Storage Architecture

```mermaid
graph TB
    subgraph "Data Storage Layer"
        PD[playerData.json<br/>Main Player Storage]
        SC[safariContent.json<br/>Safari Configuration]
        MH[messageHistory.json<br/>Message Tracking]
    end

    subgraph "Data Access Layer"
        ST[storage.js<br/>Player Data Manager]
        SM[safariManager.js<br/>Safari Content Manager]
        EM[entityManager.js<br/>Entity CRUD Operations]
    end

    subgraph "Cache Layer"
        RC[Request Cache<br/>Per-Request Caching]
        SRC[Safari Request Cache<br/>Safari-Specific Cache]
        PNC[Player Name Cache<br/>Name Consistency]
    end

    PD --> ST
    SC --> SM
    SC --> EM
    ST --> RC
    SM --> SRC
    SM --> PNC
```

### Data Structure Hierarchy

```mermaid
classDiagram
    class PlayerData {
        +guilds: Map
        +clearRequestCache()
        +loadPlayerData(guildId?)
        +savePlayerData(data)
    }
    
    class GuildData {
        +players: Map~userId-PlayerInfo~
        +tribes: Map~roleId-TribeInfo~
        +timezones: Map
        +seasons: Map~seasonId-Season~
        +applications: Map~appId-Application~
        +applicationConfigs: Map
        +rolereactionmapping: Map
    }
    
    class PlayerInfo {
        +name: string
        +safari: SafariPlayer
        +inventory: Object
        +currency: number
        +tribe: string
        +timezone: string
    }
    
    class SafariPlayer {
        +inventory: Map~itemId-quantity~
        +currency: number
        +points: PointsData
        +location: LocationData
        +usedButtons: Array
        +progress: ProgressData
        +discoveredCells: Array
        +unlockedStores: Array
        +paused: PauseData
    }
    
    class Season {
        +id: string
        +name: string
        +createdAt: timestamp
        +createdBy: userId
        +source: string
        +archived: boolean
        +linkedEntities: LinkedEntities
    }
    
    class LinkedEntities {
        +applicationConfigs: Array
        +tribes: Array
        +castRankings: Array
    }
    
    PlayerData --> GuildData
    GuildData --> PlayerInfo
    GuildData --> Season
    PlayerInfo --> SafariPlayer
    Season --> LinkedEntities
```

### Safari Content Architecture

```mermaid
graph LR
    subgraph "Safari Content Structure"
        SC[Safari Content]
        SC --> I[Items]
        SC --> S[Stores]
        SC --> B[Buttons]
        SC --> M[Maps]
        SC --> C[Config]
        
        M --> MC[Map Cells]
        MC --> CC[Cell Content]
        CC --> BA[Button Actions]
        CC --> SA[Store Access]
        
        S --> SI[Store Items]
        SI --> IT[Item Types]
        
        B --> AC[Action Chains]
        AC --> AT[Action Types]
    end
```

### Entity Management System

```mermaid
flowchart TD
    subgraph "Entity Manager Operations"
        LE[loadEntities] --> |All entities| OBJ[Object Map]
        LO[loadEntity] --> |Single entity| ENT[Entity Object]
        CE[createEntity] --> |New entity| ID[Generated ID]
        UE[updateEntity] --> |Full update| MRG[Merged Entity]
        UF[updateEntityFields] --> |Partial update| FLD[Updated Fields]
        DE[deleteEntity] --> |Remove| CLN[Cleanup Refs]
        SE[searchEntities] --> |Filter| RES[Search Results]
    end
    
    subgraph "Supported Entity Types"
        IT2[item]
        ST2[store]
        SB[safari_button]
        SC2[safari_config]
        MC2[map_cell]
    end
    
    subgraph "Entity Validation"
        VL[validateContent]
        VL --> REQ[Required Fields]
        VL --> LEN[Length Limits]
        VL --> RNG[Number Ranges]
        VL --> PAT[Pattern Match]
    end
```

### CRUD Operations Flow

```mermaid
sequenceDiagram
    participant UI as Discord UI
    participant BH as Button Handler
    participant EF as Edit Framework
    participant EM as Entity Manager
    participant ST as Storage
    participant FS as File System

    UI->>BH: User interaction
    BH->>EF: Create edit UI
    EF->>EM: Load entities
    EM->>ST: Request data
    ST-->>ST: Check cache
    alt Cache miss
        ST->>FS: Read JSON file
        FS-->>ST: Raw data
        ST-->>ST: Parse & cache
    end
    ST-->>EM: Entity data
    EM-->>EF: Formatted entities
    EF-->>BH: UI components
    BH-->>UI: Update message
    
    UI->>BH: Edit submission
    BH->>EM: Update entity
    EM->>ST: Save changes
    ST->>FS: Write JSON
    ST-->>ST: Clear cache
    EM-->>BH: Success
    BH-->>UI: Updated UI
```

### Season & Application Management

```mermaid
graph TB
    subgraph "Season Management"
        CS[createSeason] --> SID[Season ID]
        GS[getAllSeasons] --> SL[Season List]
        LS[linkSeasonToEntity] --> LNK[Entity Links]
        AS[archiveSeason] --> CHK[Check Dependencies]
        MS[migrateToUnifiedSeasons] --> MIG[Migration]
    end
    
    subgraph "Application Flow"
        AC[Application Config]
        AC --> SE[Season Entity]
        SE --> AP[Applications]
        AP --> TR[Tribes/Castlist]
        TR --> CR[Cast Rankings]
    end
    
    subgraph "Data Relations"
        SE -.-> AC
        SE -.-> TR
        SE -.-> CR
    end
```

### Cache Management System

```mermaid
stateDiagram-v2
    [*] --> RequestStart: New Discord Interaction
    
    RequestStart --> ClearCaches: Clear all caches
    ClearCaches --> Processing: Process request
    
    state Processing {
        [*] --> CheckCache: Data needed
        CheckCache --> CacheHit: Found in cache
        CheckCache --> CacheMiss: Not in cache
        
        CacheHit --> ReturnData: Return cached
        CacheMiss --> LoadFile: Load from disk
        LoadFile --> StoreCache: Store in cache
        StoreCache --> ReturnData
        
        ReturnData --> [*]
    }
    
    Processing --> RequestEnd: Complete
    RequestEnd --> [*]: Caches cleared
    
    note right of CacheHit: Increment hits counter
    note right of CacheMiss: Increment misses counter
```

### Data Update Functions by Module

```mermaid
graph LR
    subgraph "storage.js"
        LP[loadPlayerData]
        SP[savePlayerData]
        UT[updateTribe]
        UA[updateApplications]
        CS2[createSeason]
        AS2[archiveSeason]
    end
    
    subgraph "safariManager.js"
        LSC[loadSafariContent]
        SSC[saveSafariContent]
        IPS[initializePlayerSafari]
        CSC[clearSafariCache]
        MPS[migrateExistingPlayersToSafari]
    end
    
    subgraph "entityManager.js"
        LE2[loadEntities]
        CE2[createEntity]
        UE2[updateEntity]
        UEF[updateEntityFields]
        DE2[deleteEntity]
        SE2[searchEntities]
    end
    
    subgraph "pointsManager.js"
        IEP[initializeEntityPoints]
        GEP[getEntityPoints]
        UP[usePoints]
        SEP[setEntityPoints]
    end
    
    subgraph "mapMovement.js"
        GPL[getPlayerLocation]
        SPL[setPlayerLocation]
        MP[movePlayer]
        IPM[initializePlayerOnMap]
    end
```

### Data File Structure

```mermaid
graph TD
    subgraph "playerData.json Structure"
        PD2["{<br/>  'guildId': {<br/>    players: {},<br/>    tribes: {},<br/>    timezones: {},<br/>    seasons: {},<br/>    applications: {},<br/>    applicationConfigs: {}<br/>  }<br/>}"]
    end
    
    subgraph "safariContent.json Structure"
        SC3["{<br/>  'guildId': {<br/>    items: {},<br/>    stores: {},<br/>    buttons: {},<br/>    maps: {<br/>      active: 'mapId',<br/>      'mapId': {<br/>        coordinates: {}<br/>      }<br/>    },<br/>    config: {}<br/>  }<br/>}"]
    end
    
    subgraph "Entity Storage Paths"
        ESP[getEntityPath function]
        ESP --> |item| ITP["safari.items"]
        ESP --> |store| STP["safari.stores"]
        ESP --> |safari_button| BTP["safari.buttons"]
        ESP --> |safari_config| CTP["safari.config"]
        ESP --> |map_cell| MTP["maps.[mapId].coordinates"]
    end
```

### Edit Framework Configuration

```mermaid
graph TB
    subgraph "EDIT_CONFIGS Structure"
        EC[Entity Config]
        EC --> DN[displayName: string]
        EC --> PR[properties: Object]
        EC --> CN[content: Object]
        EC --> OP[operations: Array]
        
        PR --> PT[Property Types]
        PT --> TXT[text]
        PT --> TXA[textarea]
        PT --> NUM[number]
        PT --> SEL[select]
        PT --> TAG[tags]
        
        CN --> CT[Content Types]
        CT --> ACT[actions]
        CT --> ITM[items]
        CT --> EFF[effects]
        
        OP --> OPT[Operation Types]
        OPT --> RO[reorder]
        OPT --> ED[edit]
        OPT --> DL[delete]
        OPT --> AD[add]
        OPT --> TS[test]
    end
```

### Button Handler Pattern

```mermaid
flowchart LR
    subgraph "Button ID Patterns"
        ES[entity_select] --> |Select type| ET[Entity Type]
        EE[entity_edit] --> |Edit mode| EM[Edit Mode]
        EV[entity_view] --> |View mode| VM[View Mode]
        ED2[entity_delete] --> |Delete| DM[Delete Modal]
        EC2[entity_create] --> |Create| CM[Create Modal]
        
        EFE[entity_field_edit_*] --> |Field edit| FE[Field Editor]
        EFG[entity_field_group_*] --> |Group edit| GE[Group Editor]
    end
    
    subgraph "ID Structure"
        FE --> |Parse| PRS["[type, id, field]"]
        GE --> |Parse| GRP["[groupName]"]
    end
```

## Key Features

### 1. **Request-Scoped Caching**
- Caches cleared at start of each Discord interaction
- Prevents stale data across requests
- Tracks cache hits/misses for performance monitoring

### 2. **Entity Management**
- Unified CRUD operations for all Safari entities
- Type-specific validation and defaults
- Automatic ID generation and metadata tracking

### 3. **Season Registry**
- Centralized season management
- Links between seasons and entities (apps, tribes, rankings)
- Migration support for legacy data

### 4. **Data Integrity**
- Validation before writes
- Reference cleanup on deletes
- Atomic updates (all or nothing)

### 5. **Search Capabilities**
- Case-insensitive substring search
- Searches multiple fields (name, description, tags)
- Returns filtered entity objects

## Performance Optimizations

1. **Lazy Loading**: Data loaded only when needed
2. **Request Caching**: Same data not read twice per request
3. **Selective Updates**: Only modified fields written
4. **Efficient Search**: In-memory filtering vs. database queries

## Migration Strategies

1. **Safari Migration**: `migrateExistingPlayersToSafari()`
2. **Season Migration**: `migrateToUnifiedSeasons()`
3. **Backwards Compatibility**: Legacy data structures supported