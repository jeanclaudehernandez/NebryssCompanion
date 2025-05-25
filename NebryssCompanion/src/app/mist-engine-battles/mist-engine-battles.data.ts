// mist-engine-battles.data.ts

export interface MistEngineBattles {
  title: string;
  introduction: string;
  subtitle: string;
  sections: {
    title: string;
    content?: string[];
    subsections?: {
      title: string;
      content?: string[];
      table?: {
        headers: string[];
        rows: string[][];
        footer?: string;
      };
      footer?: string;
    }[];
    footer?: string;
  }[];
}

export const mistEngineBattlesData: MistEngineBattles = {
    "title": "Cooperative Mist Engine Ship Battles: Comprehensive Tutorial",
    "introduction": "Welcome to **Cooperative Mist Engine Ship Battles**, where three players work together to pilot a single mist-powered vessel, each managing a critical station: **the Helm, the Mist Engines, and the Weapons**. Your goal is to outmaneuver and destroy enemy ships while managing your vessel's limited **Mist Energy (max 7)**.",
    "subtitle": "Each station operates at different efficiency levels depending on how much energy is allocated. Coordination is key—your team must decide how to distribute energy each turn to maximize speed, mist navigation, and firepower!",
    "sections": [
        {
            "title": "Game Setup",
            "content": [
                "**Players:** 3 (Helm, Mist Engines, Weapons)",
                "**Mist Energy:** 7 maximum per turn (shared between all stations)",
                "**Movement Templates:** There are **6 types** (3x Straight, 2x Left Curve, 3x Right Curve, 1x Hover, 1x Double Firepower, 1x Mist Surge)"
            ],
            "subsections": [
                {
                    "title": "Turn Order",
                    "content": [
                        "First round order is determined randomly.",
                        "Each subsequent round, the last player becomes the first, rotating order."
                    ]
                }
            ]
        },
        {
            "title": "Player Stations & Actions",
            "subsections": [
                {
                    "title": "1. The Helm Player (Navigation Control)",
                    "content": [
                        "At the start of the game (and each turn), the Helm player randomly draws **4 movement templates** (using dice).",
                        "**On their turn, they may spend energy to navigate the ship in different ways:**"
                    ],
                    "table": {
                        "headers": [
                            "Energy Spent",
                            "Effect"
                        ],
                        "rows": [
                            [
                                "0 Energy",
                                "Drift forward, distance = **half (rounded down) of Mist Engines' result**"
                            ],
                            [
                                "1 Energy",
                                "Pick **3 templates**, then **randomly select 1** to navigate"
                            ],
                            [
                                "2 Energy",
                                "Pick **2 templates**, then **randomly select 1** to navigate"
                            ],
                            [
                                "3 Energy",
                                "Pick **1 template** and use it"
                            ],
                            [
                                "4 Energy",
                                "Pick **2 templates**, combine them in any order for a custom maneuver"
                            ],
                            [
                                "2 Energy",
                                "Discard all templates and draw **4 new random ones**"
                            ]
                        ],
                        "footer": "**After moving:** All candidate templates (or discarded) return to the pool."
                    }
                },
                {
                    "title": "2. The Mist Engines Player (Speed & Mist Efficiency)",
                    "content": [
                        "The Mist Engines player determines **how far the ship moves** based on the Helm's chosen template and the density of the mist."
                    ],
                    "table": {
                        "headers": [
                            "Energy Spent",
                            "Effect"
                        ],
                        "rows": [
                            [
                                "0 Energy",
                                "The ship losses momentum and **doesn't move**"
                            ],
                            [
                                "1 Energy",
                                "Roll **1d3**, move to that result (or half, rounded down)"
                            ],
                            [
                                "2 Energy",
                                "Roll **1d4**, move to that result (or half), then adjust course **1\"** in any direction"
                            ],
                            [
                                "3 Energy",
                                "Roll **1d6**, move to that result (or half), then adjust course **1\"** in any direction"
                            ],
                            [
                                "4 Energy",
                                "Roll **2d6**, keep one result, move to that value (or half)"
                            ],
                            [
                                "5 Energy",
                                "Roll **2d6** (keep one) + **1d3**, move to **both values** (or half)"
                            ]
                        ]
                    },
                    "footer": ""
                },
                {
                    "title": "3. The Weapons Player (Offense)",
                    "content": [
                        "The Weapons player spends energy to determine how many weapons fire."
                    ],
                    "table": {
                        "headers": [
                            "Energy Spent",
                            "Effect"
                        ],
                        "rows": [
                            [
                                "0 Energy",
                                "No weapons fire"
                            ],
                            [
                                "1 Energy",
                                "Roll **1d4** weapons. On hit results of **1**, the ship suffers from the weapon malfunction (suffering half the weapon damage)**"
                            ],
                            [
                                "2 Energy",
                                "Roll **1d6** weapons"
                            ],
                            [
                                "3 Energy",
                                "Roll **1d8** weapons (**1 guaranteed hit**)"
                            ],
                            [
                                "4 Energy",
                                "Roll **1d8** weapons (**2 guaranteed hits**)"
                            ],
                            [
                                "5 Energy",
                                "Roll **1d8** weapons (**2 guaranteed hits**). Any **6 rolled** triggers an **extra weapon shoot** (possibly chaining attacks)"
                            ]
                        ],
                        "footer": ""
                    }
                }
            ]
        },
        {
            "title": "Turn Structure",
            "content": [
                "1. **Energy Allocation:** The team decides how to distribute **7 Mist Energy Points** between stations.",
                "2. **Player Actions (in turn order):**",
                "- **Helm Player** navigates the ship.",
                "- **Mist Engines Player** adjusts speed and mist efficiency.",
                "- **Weapons Player** fires at enemies.",
                "3. **Next Round:** Turn order rotates (last player becomes first)."
            ]
        },
        {
            "title": "Strategy Tips",
            "content": [
                "**Balance Energy:** Don't overspend on one station—navigation and firepower must work together!",
                "**Custom Moves (4 Energy Helm):** Combining two templates allows for unpredictable maneuvers through the mist.",
                "**High-Risk Weapons (5 Energy):** Can lead to devastating attacks but may leave little energy for evasion.",
                "**Mist Adjustments:** Use the extra **1\"** movement to fine-tune positioning after rolling."
            ]
        }
    ]
};