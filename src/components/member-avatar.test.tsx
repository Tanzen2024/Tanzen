import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/render-with-providers';
import { MemberAvatar, getInitials } from './member-avatar';

const PHOTO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

describe('MemberAvatar', () => {
  it('TEST 1 — membre avec photo : la photo est affichée (pas les initiales)', () => {
    renderWithProviders(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: PHOTO }} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', PHOTO);
    expect(screen.queryByText('CD')).not.toBeInTheDocument();
  });

  it('TEST 2 — membre sans photo (photoUrl vide) : les initiales sont affichées', () => {
    renderWithProviders(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: '' }} />);
    expect(screen.getByText('CD')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('membre sans `photoUrl` du tout (prop optionnelle) : fallback initiales, pas de crash', () => {
    renderWithProviders(<MemberAvatar member={{ firstName: 'Fatou', lastName: 'Ndiaye' }} />);
    expect(screen.getByText('FN')).toBeInTheDocument();
  });

  it('TEST 3 — photo invalide (échec de chargement, onError) : bascule sur les initiales, sans image cassée ni erreur affichée', () => {
    renderWithProviders(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: 'https://exemple.invalide/404.jpg' }} />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('CD')).toBeInTheDocument();
  });

  it('TEST 4 — alt pertinent : identifie le membre, jamais un texte générique ("image"/"avatar")', () => {
    renderWithProviders(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: PHOTO }} />);
    const img = screen.getByRole('img');
    const alt = img.getAttribute('alt') ?? '';
    expect(alt).toContain('Cheikh Diop');
    expect(alt.toLowerCase()).not.toBe('image');
    expect(alt.toLowerCase()).not.toBe('avatar');
  });

  it('l\'avatar initiales (fallback) reste accessible via aria-hidden — même comportement que l\'ancien composant Avatar', () => {
    renderWithProviders(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: '' }} />);
    expect(screen.getByText('CD')).toHaveAttribute('aria-hidden', 'true');
  });

  it('changer de photoUrl réinitialise un échec précédent (une nouvelle photo mérite une nouvelle tentative)', () => {
    const { rerender } = renderWithProviders(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: 'https://exemple.invalide/404.jpg' }} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('CD')).toBeInTheDocument();
    rerender(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: PHOTO }} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', PHOTO);
  });

  it('tailles sm/lg conservent les dimensions déjà établies par l\'ancien Avatar (size-9/size-14)', () => {
    const { unmount } = renderWithProviders(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: '' }} size="sm" />);
    expect(screen.getByText('CD').className).toContain('size-9');
    unmount();
    renderWithProviders(<MemberAvatar member={{ firstName: 'Cheikh', lastName: 'Diop', photoUrl: '' }} size="lg" />);
    expect(screen.getByText('CD').className).toContain('size-14');
  });
});

describe('getInitials — logique de fallback partagée', () => {
  it('reproduit exactement l\'algorithme préexistant (2 premières lettres, sans mise en majuscule forcée)', () => {
    expect(getInitials('Cheikh Diop')).toBe('CD');
    expect(getInitials('Fatou Ndiaye')).toBe('FN');
  });
});
