/**
 * @file ErrorBoundary.js
 * @description Composant React.
 */

import React from 'react';
import { Alert, Button } from 'react-bootstrap';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center">
          <Alert variant="danger" className="rounded-4 shadow-sm">
            <iconify-icon icon="solar:danger-bold" style={{ fontSize: '48px' }} className="mb-3"></iconify-icon>
            <h4 className="fw-bold">Oups ! Quelque chose s'est mal passé.</h4>
            <p>Une erreur est survenue lors de l'affichage de cette section.</p>
            <hr />
            <Button variant="danger" onClick={() => window.location.reload()} className="rounded-pill px-4">
              Actualiser la page
            </Button>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;