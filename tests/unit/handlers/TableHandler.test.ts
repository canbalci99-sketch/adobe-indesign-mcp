import { describe, it, expect, vi } from 'vitest';
import { TableHandler } from '../../../src/handlers/TableHandler.js';

describe('TableHandler', () => {
  function createMockExecutor() {
    return {
      execute: vi.fn().mockResolvedValue({ result: 'ok' }),
      on: vi.fn(),
      handleResponse: vi.fn(),
      cancelAll: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ connected: true, queueDepth: 0 }),
    };
  }

  describe('handler structure', () => {
    it('should have name "table"', () => {
      const handler = new TableHandler(createMockExecutor() as any);
      expect(handler.name).toBe('table');
    });

    it('should expose 16 tools', () => {
      const handler = new TableHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(16);
    });

    it('should export all expected tools', () => {
      const handler = new TableHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('table_create');
      expect(names).toContain('table_list');
      expect(names).toContain('table_addRow');
      expect(names).toContain('table_addColumn');
      expect(names).toContain('table_deleteRow');
      expect(names).toContain('table_deleteColumn');
      expect(names).toContain('table_setCell');
      expect(names).toContain('table_getInfo');
      expect(names).toContain('table_mergeCells');
      expect(names).toContain('table_splitCell');
      expect(names).toContain('table_setCellFill');
      expect(names).toContain('table_setCellStroke');
      expect(names).toContain('table_setCellInset');
      expect(names).toContain('table_setCellAlignment');
      expect(names).toContain('table_setHeaderFooter');
      expect(names).toContain('table_setRowColumnSize');
    });

    it('should have inputSchema as a plain object', () => {
      const handler = new TableHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });
  });

  describe('table_create', () => {
    it('should call executor with code creating a table', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { rows: 3, columns: 4 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_create')!;
      const result = await tool.handler({
        pageIndex: 0,
        bounds: { top: 10, left: 20, bottom: 100, right: 200 },
        rows: 3, columns: 4,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('textFrames.add()');
      expect(code).toContain('tables.add()');
      expect(code).toContain('[10, 20, 100, 200]');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should default to 3 rows and 3 columns', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { rows: 3, columns: 3 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_create')!;
      const result = await tool.handler({
        pageIndex: 0,
        bounds: { top: 0, left: 0, bottom: 50, right: 100 },
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('tables.add()');
      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.rows).toBe(3);
    });
  });

  describe('table_list', () => {
    it('should call executor with code listing tables on a page', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: [{ index: 0, rows: 3, columns: 4 }] });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_list')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pages[0].tables');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should list document-wide tables when no pageIndex', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: [] });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_list')!;
      await tool.handler({}, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('__resolveDocument().tables');
    });

    it('should return table list from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: [{ index: 0, rows: 3, columns: 4 }, { index: 1, rows: 2, columns: 2 }] });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_list')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].rows).toBe(3);
      expect(parsed[1].columns).toBe(2);
    });
  });

  describe('table_addRow', () => {
    it('should call executor with rows.add()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { rows: 4, columns: 3 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_addRow')!;
      const result = await tool.handler({ pageIndex: 0, tableIndex: 0, atIndex: 1 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('rows.add(1)');
      expect(code).toContain('table.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should default atIndex to 0', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { rows: 4, columns: 3 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_addRow')!;
      await tool.handler({ pageIndex: 0, tableIndex: 0 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('rows.add(0)');
    });
  });

  describe('table_addColumn', () => {
    it('should call executor with columns.add()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { rows: 3, columns: 5 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_addColumn')!;
      const result = await tool.handler({ pageIndex: 0, tableIndex: 0, atIndex: 2 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('columns.add(2)');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('table_deleteRow', () => {
    it('should call executor with row.remove()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { rows: 2, columns: 3 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_deleteRow')!;
      const result = await tool.handler({ pageIndex: 0, tableIndex: 0, rowIndex: 1 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('rows[1].remove()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('table_deleteColumn', () => {
    it('should call executor with column.remove()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { rows: 3, columns: 2 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_deleteColumn')!;
      const result = await tool.handler({ pageIndex: 0, tableIndex: 0, columnIndex: 2 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('columns[2].remove()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('table_setCell', () => {
    it('should call executor with cell contents assignment', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'set' });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCell')!;
      const result = await tool.handler({ pageIndex: 0, tableIndex: 0, row: 1, column: 2, content: 'Cell Value' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('rows[1].cells[2].contents');
      expect(code).toContain('Cell Value');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should escape special characters in content', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'set' });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCell')!;
      await tool.handler({ pageIndex: 0, tableIndex: 0, row: 0, column: 0, content: 'Line1\nLine2' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('\\n');
    });

    it('should handle table not found via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Table not found'));
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCell')!;
      const result = await tool.handler({ pageIndex: 0, tableIndex: 99, row: 0, column: 0, content: 'x' }, {});

      expect(result.isError).toBe(true);
    });
  });

  describe('table_getInfo', () => {
    it('should call executor with code reading table structure', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: { rows: 2, columns: 2, cells: [{ row: 0, column: 0, contents: 'A' }, { row: 0, column: 1, contents: 'B' }] },
      });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_getInfo')!;
      const result = await tool.handler({ pageIndex: 0, tableIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('table.isValid');
      expect(code).toContain('rows.length');
      expect(code).toContain('columns.length');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return table info from executor', async () => {
      const mock = createMockExecutor();
      const info = { rows: 3, columns: 4, cells: [{ row: 0, column: 0, contents: 'Data' }] };
      mock.execute.mockResolvedValue({ result: info });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_getInfo')!;
      const result = await tool.handler({ pageIndex: 0, tableIndex: 0 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.rows).toBe(3);
      expect(parsed.columns).toBe(4);
    });
  });

  describe('table_mergeCells', () => {
    it('should call executor with cell.merge() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { merged: true } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_mergeCells')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0,
        startRow: 0, startColumn: 0,
        endRow: 2, endColumn: 2,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('rows[0].cells[0].merge');
      expect(code).toContain('rows[2].cells[2]');
      expect(code).toContain('table.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return merged result', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { merged: true, startRow: 0, startColumn: 0, endRow: 1, endColumn: 1 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_mergeCells')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0,
        startRow: 0, startColumn: 0,
        endRow: 1, endColumn: 1,
      }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.merged).toBe(true);
      expect(parsed.startRow).toBe(0);
      expect(parsed.endColumn).toBe(1);
    });
  });

  describe('table_splitCell', () => {
    it('should call executor with cell.split() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { split: true } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_splitCell')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 1, columnIndex: 2,
        horizontal: true, vertical: false,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('rows[1].cells[2].split');
      expect(code).toContain('true, false');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should default horizontal and vertical to true', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { split: true } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_splitCell')!;
      await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 0, columnIndex: 0,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('split(true, true)');
    });
  });

  describe('table_setCellFill', () => {
    it('should call executor with fillColor assignment', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { fillColor: 'Red' } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCellFill')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 1, columnIndex: 2,
        fillColor: 'Red',
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('cell.fillColor');
      expect(code).toContain('colors.item("Red")');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should include tintPercent when provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { fillColor: 'Blue', tint: 50 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCellFill')!;
      await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 0, columnIndex: 0,
        fillColor: 'Blue', tintPercent: 50,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('cell.fillTint = 50');
    });
  });

  describe('table_setCellStroke', () => {
    it('should call executor with edge stroke assignments', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { edge: 'top', strokeWeight: 2 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCellStroke')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 1, columnIndex: 2,
        edge: 'top', strokeWeight: 2,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('topEdgeStrokeWeight = 2');
      expect(code).toContain('table.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle "all" edge by generating assignments for all 4 edges', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { edge: 'all', strokeWeight: 1 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCellStroke')!;
      await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 0, columnIndex: 0,
        edge: 'all', strokeWeight: 1, strokeColor: 'Black',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('topEdgeStrokeWeight');
      expect(code).toContain('bottomEdgeStrokeWeight');
      expect(code).toContain('leftEdgeStrokeWeight');
      expect(code).toContain('rightEdgeStrokeWeight');
      expect(code).toContain('colors.item("Black")');
    });

    it('should include strokeColor and strokeType when provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { edge: 'left', strokeWeight: 3 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCellStroke')!;
      await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 0, columnIndex: 0,
        edge: 'left', strokeWeight: 3, strokeColor: 'Red', strokeType: 'Dashed',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('leftEdgeStrokeColor');
      expect(code).toContain('colors.item("Red")');
      expect(code).toContain('strokeStyles.item("Dashed")');
    });
  });

  describe('table_setCellInset', () => {
    it('should call executor with all four inset assignments', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { top: 2, bottom: 3, left: 4, right: 5 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCellInset')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 1, columnIndex: 2,
        top: 2, bottom: 3, left: 4, right: 5,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('cell.topInset = 2');
      expect(code).toContain('cell.bottomInset = 3');
      expect(code).toContain('cell.leftInset = 4');
      expect(code).toContain('cell.rightInset = 5');
      expect(code).toContain('table.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('table_setCellAlignment', () => {
    it('should call executor with justification assignments', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { horizontalAlignment: 'center', verticalAlignment: 'middle' } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCellAlignment')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 1, columnIndex: 2,
        horizontalAlignment: 'center', verticalAlignment: 'center',
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('paragraphs[0].justification');
      expect(code).toContain('Justification.CENTER_ALIGN');
      expect(code).toContain('verticalJustification');
      expect(code).toContain('VerticalJustification.CENTER_ALIGN');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle optional alignment params', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { horizontalAlignment: 'right', verticalAlignment: '' } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setCellAlignment')!;
      await tool.handler({
        pageIndex: 0, tableIndex: 0, rowIndex: 0, columnIndex: 0,
        horizontalAlignment: 'right',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('Justification.RIGHT_ALIGN');
      expect(code).not.toContain('verticalJustification');
    });
  });

  describe('table_setHeaderFooter', () => {
    it('should call executor with headerRowCount and footerRowCount', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { headerRows: 2, footerRows: 1 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setHeaderFooter')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0, headerRows: 2, footerRows: 1,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('table.headerRowCount = 2');
      expect(code).toContain('table.footerRowCount = 1');
      expect(code).toContain('table.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should default headerRows and footerRows to 0', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { headerRows: 0, footerRows: 0 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setHeaderFooter')!;
      await tool.handler({ pageIndex: 0, tableIndex: 0 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('headerRowCount = 0');
      expect(code).toContain('footerRowCount = 0');
    });
  });

  describe('table_setRowColumnSize', () => {
    it('should set row height', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { type: 'row', index: 1, size: 30 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setRowColumnSize')!;
      const result = await tool.handler({
        pageIndex: 0, tableIndex: 0,
        type: 'row', index: 1, size: 30,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('table.rows[1].height = 30');
      expect(code).toContain('table.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should set column width', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { type: 'column', index: 0, size: 50 } });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setRowColumnSize')!;
      await tool.handler({
        pageIndex: 0, tableIndex: 0,
        type: 'column', index: 0, size: 50,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('table.columns[0].width = 50');
    });

    it('should convert mm to points', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: {} });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setRowColumnSize')!;
      await tool.handler({
        pageIndex: 0, tableIndex: 0,
        type: 'row', index: 0, size: 10, units: 'mm',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('.height = 28.3465');
    });

    it('should default units to points', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: {} });
      const handler = new TableHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'table_setRowColumnSize')!;
      await tool.handler({
        pageIndex: 0, tableIndex: 0,
        type: 'column', index: 0, size: 72,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('.width = 72');
    });
  });
});
