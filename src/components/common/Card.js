// src/components/common/Card.js
import React from 'react';
import { Card as BootstrapCard } from 'react-bootstrap';

const Card = ({ title, children, className = '' }) => {
  return (
    <BootstrapCard className={`shadow-sm ${className}`}>
      {title && (
        <BootstrapCard.Header>
          <BootstrapCard.Title>{title}</BootstrapCard.Title>
        </BootstrapCard.Header>
      )}
      <BootstrapCard.Body>{children}</BootstrapCard.Body>
    </BootstrapCard>
  );
};

export default Card;