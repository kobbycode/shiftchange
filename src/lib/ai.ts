import type { Shift, User } from "./mock-db";

interface AISuggestions {
  causes: string[];
  steps: string[];
  resolution: string;
  similarHistoricalFaults: string[];
}

export class AIService {
  static getFaultSuggestions(category: string, description: string): AISuggestions {
    const desc = description.toLowerCase();
    const cat = category.toLowerCase();

    // Default suggestions
    let suggestions: AISuggestions = {
      causes: [
        "Primary power interruption at the transmission site",
        "Intermittent network packet loss or link jitter",
        "Hardware component thermal shutdown"
      ],
      steps: [
        "Check main distribution breaker status",
        "Ping transmitter controller and SNMP sensors",
        "Verify backup microwave or fiber receiver sync indicators"
      ],
      resolution: "Perform a hard power cycle of the transmitter exciter or switch to the backup receiver link.",
      similarHistoricalFaults: [
        "Adom FM Off-Air Incident (June 14) - resolved by microwave dish alignment",
        "Joy FM Transmitter Mute Alert (July 02) - resolved by switching to backup exciter"
      ]
    };

    if (cat.includes("microwave") || desc.includes("microwave") || desc.includes("dish") || desc.includes("signal")) {
      suggestions = {
        causes: [
          "Heavy rainfall causing signal attenuation (rain fade)",
          "Dislocation of transmitter dish alignment due to high winds",
          "Local oscillator frequency drift in the outdoor unit (ODU)"
        ],
        steps: [
          "Log into the microwave link web portal to check RSSI and SNR margin levels",
          "Verify antenna alignment status on both studio and transmitter ends",
          "Inspect outdoor cable connectors for water ingress"
        ],
        resolution: "Switch transmission stream to the backup fiber connection and arrange for outdoor rigging technicians to align the dish.",
        similarHistoricalFaults: [
          "Joy FM ODU Link Drop (May 18) - resolved by swapping outdoor connector",
          "Asempa FM Signal Degradation (July 10) - resolved by switching to backup fiber link"
        ]
      };
    } else if (cat.includes("transmitter") || desc.includes("off air") || desc.includes("silence")) {
      suggestions = {
        causes: [
          "RF power amplifier modular fault or over-temperature protection",
          "Coaxial transmission line VSWR high-voltage protection trip",
          "Three-phase mains power phase loss"
        ],
        steps: [
          "Check transmitter LCD screen front panel alarm codes",
          "Measure forward and reflected power (VSWR status)",
          "Verify site exhaust fans are functional and intake filters are clean"
        ],
        resolution: "Reset transmitter interlock parameters, clear alarm logs, and scale back forward output power to 80% to prevent high temperature trips.",
        similarHistoricalFaults: [
          "Hitz FM Exciter Overheat (April 03) - resolved by cleaning air filters",
          "Adom FM Mains Failure (June 28) - resolved by automatic generator kick-in"
        ]
      };
    } else if (cat.includes("power") || desc.includes("ups") || desc.includes("generator") || desc.includes("mains")) {
      suggestions = {
        causes: [
          "Utility grid voltage fluctuation (over-voltage protection trip)",
          "Automatic Transfer Switch (ATS) contactor failure",
          "Diesel generator start battery voltage drop"
        ],
        steps: [
          "Verify grid voltage levels on the main breaker display panel",
          "Check backup UPS battery state of charge (SoC) and active alarms",
          "Check starter battery charger voltage on the standby generator"
        ],
        resolution: "Manually force the ATS to bypass grid input, engage the standby diesel generator, and request service logs for the UPS battery pack.",
        similarHistoricalFaults: [
          "NOC Main Server Room UPS Alarm (May 12) - resolved by replacing battery cells",
          "Transmission Tower ATS Jitter (June 05) - resolved by manual bypass selection"
        ]
      };
    } else if (cat.includes("console") || cat.includes("studio") || desc.includes("fader") || desc.includes("audio")) {
      suggestions = {
        causes: [
          "A/D converter DSP card overheating in the audio routing frame",
          "Corrupted routing patch on the Axia/Livewire console engine",
          "Analog console fader conductive plastic track degradation"
        ],
        steps: [
          "Log into the console processor control portal to inspect DSP load limits",
          "Perform a ping test on the console engine and checking routing matrix",
          "Clean the scratchy fader using contact cleaner spray"
        ],
        resolution: "Reboot the digital console router engine and re-map the presenter fader to spare Channel 7 in the digital routing patch.",
        similarHistoricalFaults: [
          "Studio 1 Scratchy Fader (June 11) - resolved by spraying fader rails",
          "Adom FM Studio DSP Frame Stall (July 01) - resolved by warm boot"
        ]
      };
    }

    return suggestions;
  }

  static generateShiftSummary(
    shift: Shift, 
    tech: User | undefined, 
    faults: any[], 
    tasks: any[], 
    obs: any[]
  ): string {
    const dateStr = new Date(shift.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const resolvedFaultsCount = faults.filter(f => f.status === "Resolved").length;
    const activeFaultsCount = faults.filter(f => f.status !== "Resolved").length;
    const completedTasksCount = tasks.filter(t => t.status === "Completed").length;

    let summary = `BROADCAST ENGINEERING SHIFT HANDOVER SUMMARY
--------------------------------------------------
Date: ${dateStr} | Shift: ${shift.shift_type}
Duty Engineer: ${tech?.name || "Not signed"}
Duty Location: ${shift.location}
Shift Session: ${shift.status}

1. ATTENDANCE & TIMESTAMPS
- Log check-in: ${new Date(shift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
- Log check-out: ${shift.end_time ? new Date(shift.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Active"}

2. OPERATIONAL STATUS
- Total Faults Logged: ${faults.length} (${resolvedFaultsCount} resolved, ${activeFaultsCount} active)
- Active Incident Categories: ${activeFaultsCount > 0 ? faults.filter(f => f.status !== "Resolved").map(f => f.category).join(", ") : "None - All clear"}

3. PENDING TASKS
- Shift Tasks Actioned: ${tasks.length} logged (${completedTasksCount} completed)
- Key Pending Work: ${tasks.filter(t => t.status !== "Completed").slice(0, 3).map(t => t.task_name).join("; ") || "None"}

4. OUTSIDE BROADCASTS
- OB Sessions Tracked: ${obs.length}
- Feeds details: ${obs.map(o => `${o.program_name} at ${o.location} (${o.signal_method})`).join("; ") || "No OB operations"}

Report generated dynamically by Antigravity AI NOC Assistant.`;

    return summary;
  }
}
