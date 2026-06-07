import { IEffectPlugin } from "../IEffectPlugin";
import SoundscapeManager from "../../../../../../services/SoundscapeManager";

export default class SelectionChordPlugin implements IEffectPlugin {
    public getId(): string { return "selection-chord"; }
    public getName(): string { return "Selection Chords"; }
    public getDescription(): string { return "Plays a rich, dynamic piano chord when lassoing multiple nodes. The chord complexity scales with the number of nodes selected."; }
    
    public onSelectionBox(nodeIds: string[]): void {
        const count = nodeIds.length;
        if (count === 0) return;

        // Base C4 Note
        const frequencies = [261.63];

        // Build the chord based on how many nodes were lassoed
        if (count >= 2) frequencies.push(392.00); // G4 (Power Chord)
        if (count >= 3) frequencies.push(329.63); // E4 (Major Triad)
        if (count >= 4) frequencies.push(493.88); // B4 (Major 7th)
        if (count >= 5) frequencies.push(587.33); // D5 (Major 9th)
        if (count >= 10) frequencies.push(130.81); // C3 (Bass foundation for huge selections)

        // Waveform 0 is Acoustic Grand Piano. Attenuate volume based on polyphony to prevent clipping.
        const volume = Math.min(0.1, 0.3 / frequencies.length); 
        
        frequencies.forEach((freq, index) => {
            // Stagger the notes slightly (25ms) to simulate a physical piano arpeggio/strum
            setTimeout(() => {
                SoundscapeManager.playSFX(0, freq, volume, 1.5);
            }, index * 25);
        });
    }
}
