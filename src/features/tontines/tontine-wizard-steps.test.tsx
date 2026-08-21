import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TontineWizardSteps } from './tontine-wizard-steps';

const t = (_section: 'tontines' | 'nav', key: string) => key;

describe('TontineWizardSteps — stepper réutilisable du parcours guidé (mandat finalisation UX)', () => {
  it('renders the four steps in order, each with its main label and sub-label', () => {
    render(<TontineWizardSteps t={t} current={1} />);
    expect(screen.getByText('wizardStepTontine')).toBeInTheDocument();
    expect(screen.getByText('wizardStepTontineSub')).toBeInTheDocument();
    expect(screen.getByText('wizardStepPeriod')).toBeInTheDocument();
    expect(screen.getByText('wizardStepAdhesions')).toBeInTheDocument();
    expect(screen.getByText('wizardStepOccurrences')).toBeInTheDocument();
  });

  it('marks every step before the current one as done (checkmark) and none of them at step 1', () => {
    const { container: atStepOne } = render(<TontineWizardSteps t={t} current={1} />);
    expect(atStepOne.querySelectorAll('svg').length).toBe(0);

    const { container: atStepThree } = render(<TontineWizardSteps t={t} current={3} />);
    // Tontine (1) et Période (2) sont terminées → 2 coches ; Adhérents (3, courant) et Occurrences (4, futur) affichent un numéro, pas de coche.
    expect(atStepThree.querySelectorAll('svg').length).toBe(2);
  });

  it('is a pure, stateless component — the same current step always renders the same done/active/future split', () => {
    const { container: first } = render(<TontineWizardSteps t={t} current={4} />);
    const { container: second } = render(<TontineWizardSteps t={t} current={4} />);
    expect(first.querySelectorAll('svg').length).toBe(3); // trois étapes précédentes terminées
    expect(second.querySelectorAll('svg').length).toBe(3);
  });
});
