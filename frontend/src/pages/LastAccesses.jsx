// src/pages/LastAccesses.jsx
import React from 'react';
import LastAccessesTable from '../components/LastAccessesTable';

export default function LastAccesses() {
  return (
    <div className="container mt-4">
      <h2>Últimos Accesos</h2>
      <LastAccessesTable />
    </div>
  );
}