# ⚔️ Life RPG — Official Manual

Welcome to **Life RPG**, an Obsidian plugin that transforms your real-life productivity into a fully-fledged role-playing game. By checking off tasks, maintaining habits, and completing daily goals, you gain experience (XP), earn gold (GP), and level up your character.

---

## 📖 The Core Loop

### 1. Character Progression
Your character gains XP and GP whenever you complete tasks or good habits. 
- **XP (Experience Points)**: Contributes to your overall Character Level. Leveling up increases your Max HP and makes you stronger.
- **GP (Gold Pieces)**: Your currency. Spend GP in the **Store** to buy custom rewards you define (e.g., "Watch 1 episode of Netflix" for 50 GP).
- **HP (Health Points)**: You lose HP if you complete "Bad Habits" or miss task deadlines. 
  - **💀 Death (HP = 0)**: If your HP hits zero, your character dies! You will immediately **Drop 1 Level**, lose all of your current XP, and lose 100% of your Gold (GP). Your HP will then be fully restored so you can begin recovering.

---

## 🎯 Tasks & Quests

The plugin automatically watches all the Markdown files in your vault (or just your Daily Notes folder, depending on your settings). 
When you check off a standard markdown task (`- [x] Buy groceries`), the plugin awards you base XP and GP.

### The Quests Tab 📜
In the plugin's "Quests" dashboard, you can see all active, unchecked tasks aggregated across your files. *Note: Data strictly for plugin syncing (like `[ticktick_id::]`) or hidden Obsidian comments `%%...%%` are elegantly stripped from the interface to keep your quest log clean.*

### Inline Tags (Modifiers)
You can directly embed modifiers in your task string to change its behavior.
*Example: `- [ ] Finish essay [difficulty: hard] [skill: Writing]`*

- **`[difficulty: easy/medium/hard]`**: Adjusts the XP/GP multiplier for the task based on your settings.
- **`[skill: Name]`**: Directly sends the XP gained from this task into a specific custom skill. (See "Skills" below).
- **`[deadline: YYYY-MM-DD]`** or **`[due: YYYY-MM-DD]`**: Setting a deadline enforces accountability.

### 🚨 Overdue Quests & The Daily Bleed
The Quests tab aggressively monitors your deadlines. If a task becomes **Overdue** (the deadline was yesterday or earlier), it will turn bright red in your Quests dashboard and pulse to warn you. 
**The Penalty**: Every single day that an overdue task remains unchecked, it will deal direct HP damage to you when you open Obsidian. If you have an Active Boss, *the boss itself* deals the damage! This enforces you to either complete the task, delete it, or honestly reschedule it.

### Un-completing Quests ↩️
Changing a `- [x]` back into a `- [ ]` will logically reverse time! The plugin will strip the XP and GP you earned back out of your character. If your XP falls below zero, you will instantly **Level Down**.

---

## 🧬 Core Attributes

Your character is built on 4 Core Attributes. These stats passively boost your gameplay:
- **Armstrong (STR)**: Boosts damage dealt to bosses by **+5%** per level.
- **Intelligence (INT)**: Grants a permanent **+2% Base XP** boost to all completed tasks.
- **Constitution (CON)**: Adds **+10 Base Max HP** passively per level, and grants a **2% Damage Reduction** against Boss attacks or Bad Habits.
- **Charisma (CHA)**: Grants a permanent **+3% Gold (GP)** boost to all completed tasks.

---

## 📊 Skills

While Attributes define your core passive buffs, **Skills** represent your specific real-world proficiencies (e.g., Programming, Fitness, Reading, Cooking). 

### The Skill ↔️ Attribute Synergy
Every Skill you create must be assigned a parent **Core Attribute**. 
If *Programming* is assigned to *Intelligence (INT)*:
1. You complete a task: `- [x] Fix the database sorting [skill: Programming]`.
2. Your Character gains XP.
3. Your Programming Skill gains normal XP.
4. Your overarching **INT Attribute** simultaneously absorbs the exact same amount of XP!

*As you get better at Programming, your character naturally becomes more Intelligent.*

---

## 🔄 Habits (Dailies)

Habits are recurring daily intentions. Unlike standard tasks that live in your notes, you track habits directly in the plugin's **Habits** dashboard.

### Strict Dailies
Habits are now strictly **Once-Per-Day**. 
- **Good Habits**: Once you log a good habit, the button disables until tomorrow.
- **Bad Habits**: To maintain balance, you can only log a bad habit penalty once per day.

### 🚨 Outstanding Tasks (The Backlog)
Accountability is key in Life RPG. If you fail to open the app or forget to log a habit, the system tracks your "Outstanding" days.
- **Queueing**: If you miss 3 days of "Morning Meditation", you will see 3 "Owed" instances in your dashboard.
- **Resolution**: You must resolve them before you can log today's instance.
    - **✓ Catch Up**: If you did it but forgot to log it. You get full XP/GP rewards and preserve your streak!
    - **✕ Missed**: If you truly failed. You take direct HP damage and your streak is instantly reset to 0.

---

## 💎 Reward & Quest Previews
You no longer have to guess what a task is worth! All cards in the **Quests** and **Habits** tabs now display a "Payload Preview" showing exactly how much XP and GP you will earn (or HP you will lose) upon completion.

## 🐉 Bosses & Dungeons

Instead of just watching numbers go up, you can battle mythical beasts and delve into dungeons!

### Boss Combats
When you activate a Boss (e.g., "The Procrastination Dragon"), every task you complete deals damage to the boss based on the XP earned! 
*Your total damage is actively multiplied by your STR Attribute.*
Once the Boss's HP reaches 0, you earn massive bounties of XP and Gold.

### Dungeons
Dungeons consist of "Stages". You progress to the next stage by completing an arbitrary number of tasks. Once you clear all the stages, you face the Dungeon Boss!
