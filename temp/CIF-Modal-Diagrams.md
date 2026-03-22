# CIF Modal Support — Current vs Proposed

## How it works NOW (the workaround)

```mermaid
flowchart TD
    CLICK[User clicks select menu] --> CHECK{What did they pick?}

    CHECK -->|"Edit"| BEFORE[Handle BEFORE factory<br/>Raw res.send]
    CHECK -->|"Preview"| FACTORY[Go through factory<br/>ButtonHandlerFactory.create]
    CHECK -->|"Summary"| FACTORY

    BEFORE --> MODAL[Send MODAL response<br/>type: 9]
    FACTORY --> UPDATE[Send UPDATE_MESSAGE<br/>type: 7]

    MODAL --> USER_FILLS[User fills form]
    UPDATE --> DONE1[Menu updates]

    USER_FILLS --> SUBMIT[Modal Submit handler<br/>Also NOT in factory]
    SUBMIT --> DONE2[Data saved]

    style BEFORE fill:#ff6b6b,stroke:#c0392b,color:#fff
    style SUBMIT fill:#ff6b6b,stroke:#c0392b,color:#fff
    style FACTORY fill:#2ecc71,stroke:#27ae60,color:#fff
    style MODAL fill:#3498db,stroke:#2980b9,color:#fff
    style UPDATE fill:#3498db,stroke:#2980b9,color:#fff
```

**Red = legacy code outside factory. Green = factory. Blue = Discord response.**

The split happens BEFORE the factory even runs. The developer has to know in advance which option needs a modal, and handle it separately. Every new select menu with a modal option repeats this pattern.

---

## How it SHOULD work (auto-detect)

```mermaid
flowchart TD
    CLICK[User clicks select menu] --> FACTORY[Everything goes through factory<br/>ButtonHandlerFactory.create]

    FACTORY --> HANDLER[Handler runs]

    HANDLER --> RETURN{What did handler return?}

    RETURN -->|"type: 9 MODAL"| AUTO_MODAL[Factory detects modal<br/>Sends type 9 automatically]
    RETURN -->|"components: ..."| AUTO_UPDATE[Factory detects components<br/>Sends UPDATE_MESSAGE]
    RETURN -->|"content: ..."| AUTO_NEW[Factory detects content<br/>Sends new message]

    AUTO_MODAL --> USER_FILLS[User fills form]
    AUTO_UPDATE --> DONE1[Menu updates]
    AUTO_NEW --> DONE2[New message appears]

    USER_FILLS --> SUBMIT_FACTORY[Modal Submit handler<br/>ALSO in factory]
    SUBMIT_FACTORY --> DONE3[Data saved]

    style FACTORY fill:#2ecc71,stroke:#27ae60,color:#fff
    style HANDLER fill:#2ecc71,stroke:#27ae60,color:#fff
    style SUBMIT_FACTORY fill:#2ecc71,stroke:#27ae60,color:#fff
    style AUTO_MODAL fill:#3498db,stroke:#2980b9,color:#fff
    style AUTO_UPDATE fill:#3498db,stroke:#2980b9,color:#fff
    style AUTO_NEW fill:#3498db,stroke:#2980b9,color:#fff
```

**Everything green. Factory handles all cases.** The handler just returns what it wants to show — modal, update, or new message — and the factory figures out the right Discord response type.

---

## The Actual Code Change (Small effort)

The factory currently does this check at response time:

```mermaid
flowchart LR
    RESULT[Handler returns result] --> Q1{config.updateMessage?}
    Q1 -->|Yes| UPDATE[Send UPDATE_MESSAGE<br/>type 7]
    Q1 -->|No| NEW[Send CHANNEL_MESSAGE<br/>type 4]
```

We add ONE check before that:

```mermaid
flowchart LR
    RESULT[Handler returns result] --> Q0{result.type === 9?}
    Q0 -->|Yes| MODAL[Send MODAL<br/>type 9 directly]
    Q0 -->|No| Q1{config.updateMessage?}
    Q1 -->|Yes| UPDATE[Send UPDATE_MESSAGE<br/>type 7]
    Q1 -->|No| NEW[Send CHANNEL_MESSAGE<br/>type 4]

    style Q0 fill:#f39c12,stroke:#e67e22,color:#fff
    style MODAL fill:#3498db,stroke:#2980b9,color:#fff
```

**The orange diamond is the new code.** ~5 lines in the factory. Everything else stays the same.

---

## ELI5

**Now:** The waiter asks "are you ordering food or asking for directions?" BEFORE you sit down. If you want directions, you stand at the door. If you want food, you sit at a table. Two separate experiences.

**Proposed:** You sit at the table no matter what. The waiter brings whatever you ask for — food, directions, or a menu. The waiter figures out how to deliver it. You just ask.
