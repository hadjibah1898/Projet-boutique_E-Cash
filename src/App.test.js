import { render, screen } from '@testing-library/react';
import App from './App';

// On mock (simule) le composant Auth pour éviter de tester toute la logique de connexion ici
// et pour avoir un repère fiable ("Page de Connexion") à chercher.
jest.mock('./components/Auth', () => () => <div data-testid="auth-page">Page de Connexion</div>);

// On mock la configuration Axios pour éviter les erreurs liées aux intercepteurs pendant le test
jest.mock('./utils/axiosConfig', () => jest.fn());

test('renders Auth component by default (redirect to login)', () => {
  render(<App />);
  // App.js redirige vers /login si l'utilisateur n'est pas connecté
  // On vérifie donc que notre faux composant Auth est bien affiché
  const authElement = screen.getByTestId('auth-page');
  expect(authElement).toBeInTheDocument();
});
