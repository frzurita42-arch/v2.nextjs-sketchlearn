'use client';
/* SetupWizardCard — the ONE card used for every "setup / settings" wizard so they
 * all share the exact same dimensions and components: a fixed-size CardShell with
 * the photo spot at the top ("No photo available"), a title row (+ optional header
 * action like a ⚙️ gear or ✕ close), and the paginated StepWizard body with the
 * WizardGridTemplate Next/Back buttons.
 *
 * Both the presentation-runs "Create a … activity" card and the builder ⚙️ settings
 * popup render through this, so they are pixel-for-pixel the same card. */
import { CardShell } from '@/components/ui/CardShell';
import { cardImageProps } from '@/lib/card-size';
import { StepWizard, type WizardStep } from '@/components/ui/StepWizard';

// Fixed dimensions shared by every setup card (parent sets the width via SETUP_CARD_WIDTH).
export const SETUP_CARD_WIDTH = 440;
const SETUP_IMG_MODE = 2;                       // standard top thumbnail (110px)
export const SETUP_CARD_GRID_HEIGHT = 340 + 110; // photo area + body, matches the create card

export function SetupWizardCard({ title, headerRight, steps, stepIndex, onStepChange, resetKey }: {
  title: React.ReactNode;
  headerRight?: React.ReactNode;      // e.g. a ⚙️ gear or a ✕ close button
  steps: WizardStep[];
  stepIndex: number;
  onStepChange: (i: number) => void;
  resetKey?: unknown;
}) {
  return (
    <CardShell
      view="grid"
      title=""
      {...cardImageProps(SETUP_IMG_MODE)}
      gridHeight={SETUP_CARD_GRID_HEIGHT}
      bodyStyle={{ padding: '10px 12px 12px' }}
      body={(
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <h4 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{title}</h4>
            {headerRight && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{headerRight}</span>}
          </div>
          <StepWizard
            steps={steps}
            finalActions={null}
            resetKey={resetKey}
            bodyMinHeight={186}
            actionsJustify="flex-end"
            stepIndex={stepIndex}
            onStepChange={onStepChange}
            showFooter={false}
          />
        </>
      )}
    />
  );
}
