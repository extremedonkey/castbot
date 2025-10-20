# Streamlined Setup Experience

Reece's Preferred Feature Implementation Approach: High Level Design, then incrementally tick off requirements below (bias to 'start' and emergent design, no Big Design Up Front). Let's build this out in order of a 'new user'

## Overview
I want to create a new 'welcome' install experience for new servers of my bot, help me brainstorm features and a robust technical design that re-uses our core features to maximise usage of our features.

## Objectives
* Get the bot ready for an anticipated increase in users based on release of the new CastlistV3 feature (+ advertising) with the Streamlined Setup and Welcome Messages in place already
* Increase adoption of CastBot features (most users only leverage the basic 'Season Castlists' feature and don't use Safari / Stores / Items / Winners / Alumni Castlists)
* Implement timezone changes simplifying timezone management and enabling to prepare for Daylight Savings timezones changes on Sun Nov 2nd 2025 (today is Monday 20 October 2025), making it easier for users to understand and select their own timezones and reduce number of roles taken
* Improve 'converted' users from those just prospectively installing the app to their servers
* Guide users toward CastBot Support Server and other resources to get them started.

## Context documents to read
* SeasonLifecycle.md - Explains the 'crux' of what CastBot is for (Online Reality Games) and how these features are aligned to what the users of the bot are using it for
* ComponentsV2.md
* Castlistv3.md
* DiscordAPI.md (can't remember exact name)
* DiscordMessenger.md, discordMessenger.js
* @RaP/0990_20251010_Timezone_DST_Architecture_Analysis.md - Possible design for Timezone Support

## Current State Features Impacted
* discordMessenger.js: Ability for bot to message users, we implemented and tested a basic PoC that allows sending the user a message when clicking a button, need to understand what is possible and 
* Pronoun + Timezone Role Setup: Accessible via /menu -> Tools (prod_setup) -> setup_castbot, core feature we want to include with some streamlining
* CastlistV3: Ideally we guide the users toward creating a draft castlist on their first time.

## Rough Reuqirements 
### Must Have
**CastBot Setup**
* Ability to identify user who has installed the bot install
* Ability to send that user a welcome messenge (e.g., need to craft a UI using our UI / UX framework, considering creation of re-usable components like a Gallery component to show key functions, and possible buttons / links or actions that can 'hook' the user from the install into)
* Ability to determine if any administrator / production team member of the server has ran the `/menu` OR `/castlist` feature for the first time (need to understand technical options / mechanisms, most likely seeing if they've set up any timezone or pronoun roles). Ability to test this easily.
* Ability to selectively choose what actions are completed in setup (current assumes users wants all timezones / roles setup and create / update in idempotent manner, need to give them the option to do one or both or skip completely, with a bias toward strongly encouraging them to run both)

### Streamlined Timezone Roles
* Ability to maintain a single Timezone Role which covers both DST and non-DST times depending on the time of year, which tracks the correct UTC / offset based on the current time period
* Ability to determine / set whether it is DST or not for a particular timezone (e.g., what the offset is for storage in playerData.json)
* Updating of standard timezone roles, labels etc for players
* Easy conversion process to new timezone format (prefer guided conversion rather than forced, potentially leveraging other bot features like the 'first time' requirements)
* All other active user facing timezone functionality is considered and catered for, for this feature.

## Should Have
**CastBot Setup**
* Ability to post a message from CastBot visible in the server it was installed in (similar to welcome message - don't know what is possible here in Discord, need to  research)
* Guided setup - react for X - guide the user through key optional / nice to have functionality like prod_timezone_react prod_pronoun_react  
* Ability to determine specific administrator / production team member is using any of the bot features (e.g. /menu, /castlist) for the first time (the 'Must Have; requirement is identify if setup has been ran in the server before, this is to identify if the specific admin is using it for the first tiem as there are usually multiple hosts and we want them all to adopt our bot :o)).
* Prompt the user to setup an initial season using our initial re-usable components, and potential prompt / hook to create a Season Application process
* Donate button leading to paypal.me or similar
* Castbot tips UI in /menu that has the ability to cycle through features / tips / suggestions

## Could Have
* Possible 'pick and mix' - string select getting the user to tell us what they're interested in and guide them through it (seems overkill to me plus complex)
* Redesigned /castlist ~ viral_menu replacing actionRow, Back and Forward buttons (4 components) with actionRow and String Select that has back / forward / navigation / menu (2 components) to allow fitting an additional player in each castlist
* Compact castlist
* Configuration options for castlists (e.g., currently /castlist will default to the user who used it, this is a problem for production team members who have production lists)


# Design Diagram(s)
* Mermaid Functional diagram outlining how data flows to playerData.json
* Visual overview of new features (diagram format)

# Design Options and Decisions
* TBC

# Risks
* TBC