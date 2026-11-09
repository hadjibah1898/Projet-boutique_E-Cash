// src/components/common/Table.js
import React from 'react';
import { Table as BootstrapTable, Spinner, Alert } from 'react-bootstrap';
import PropTypes from 'prop-types';

const DataTable = ({ columns, data, loading = false, emptyMessage = "Aucune donnée disponible", keyField = "_id" }) => {
  if (loading) {
    return <div className="text-center"><Spinner animation="border" /></div>;
  }

  if (!data || data.length === 0) {
    return <Alert variant="info">{emptyMessage}</Alert>;
  }

  return (
    <BootstrapTable striped bordered hover responsive>
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th key={index}>{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, rowIndex) => (
          <tr key={row[keyField] || rowIndex}>
            {columns.map((column, colIndex) => (
              <td key={colIndex}>
                {column.render ? 
                  column.render(row[column.key], row) : 
                  row[column.key]
                }
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </BootstrapTable>
  );
};

DataTable.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    key: PropTypes.string.isRequired,
    render: PropTypes.func
  })).isRequired,
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  emptyMessage: PropTypes.string,
  keyField: PropTypes.string
};

export default DataTable;