import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreviewHandler } from '../../../src/handlers/PreviewHandler.js';
import type { ScriptExecutor } from '../../../src/bridge/ScriptExecutor.js';

describe('PreviewHandler', () => {
  let executor: { execute: ReturnType<typeof vi.fn> };
  let io: {
    readFile: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    makeTempPath: () => string;
  };
  let handler: PreviewHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = { execute: vi.fn().mockResolvedValue({ id: 'x', type: 'result', result: '"ok"' }) };
    io = {
      readFile: vi.fn().mockReturnValue(Buffer.from('PNGBYTES')),
      unlink: vi.fn(),
      makeTempPath: () => '/tmp/prev-test.png',
    };
    handler = new PreviewHandler(executor as unknown as ScriptExecutor, io);
  });

  it('exposes exactly one document_preview tool', () => {
    expect(handler.tools.map((t) => t.name)).toEqual(['preview_document']);
  });

  it('sends an export script with page index, PPI and the node-side temp path', async () => {
    const tool = handler.tools[0];
    await tool.handler({ pageIndex: 2, resolutionPpi: 300 });

    const [code] = executor.execute.mock.calls[0];
    // InDesign 2026 DOM: Document.exportFile + pageString (Page has no
    // exportFile method); resolution lives in exportResolution (plain ppi)
    expect(code).toContain('__doc.pages[2]');
    expect(code).toContain('pageString = __page.name');
    expect(code).toContain('__doc.exportFile(ExportFormat.PNG_FORMAT');
    expect(code).toContain('exportResolution = 300');
    expect(code).not.toContain('resolutionPpi');
    expect(code).not.toContain('JSON.stringify');
    expect(code).not.toContain('__previewPage');
    expect(code).toContain('/tmp/prev-test.png');
  });

  it('returns an MCP image content block built from the exported file', async () => {
    const tool = handler.tools[0];
    const res = await tool.handler({});

    expect(res.isError).toBeUndefined();
    expect(res.content[0]).toEqual({
      type: 'image',
      data: Buffer.from('PNGBYTES').toString('base64'),
      mimeType: 'image/png',
    });
  });

  it('uses jpeg mime and export format when requested', async () => {
    const tool = handler.tools[0];
    await tool.handler({ format: 'jpeg' });

    const [code] = executor.execute.mock.calls[0];
    expect(code).toContain('JPEG_FORMAT');
    void tool;
  });

  it('reports a readable error when the export file never appears', async () => {
    io.readFile.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const tool = handler.tools[0];
    const res = await tool.handler({});

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('preview failed');
  });

  it('always deletes the temp file, even after read errors', async () => {
    io.readFile.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const tool = handler.tools[0];
    await tool.handler({});

    expect(io.unlink).toHaveBeenCalledWith('/tmp/prev-test.png');
  });

  it('propagates executor failures as error results', async () => {
    executor.execute.mockRejectedValue(new Error('Bridge is not connected'));
    const tool = handler.tools[0];
    const res = await tool.handler({});

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('Bridge is not connected');
  });

  it('targets another open document when documentIndex is given', async () => {
    const tool = handler.tools[0];
    await tool.handler({ documentIndex: 1 });

    const [code] = executor.execute.mock.calls[0];
    expect(code).toContain('var __doc = app.documents[1];');
  });

  it('re-exports once at a lower resolution when the render is over the cap', async () => {
    io.readFile
      .mockReturnValueOnce(Buffer.alloc(8_000_000))
      .mockReturnValueOnce(Buffer.from('PNGBYTES'));
    const tool = handler.tools[0];
    const res = await tool.handler({ resolutionPpi: 600 });

    expect(executor.execute).toHaveBeenCalledTimes(2);
    const firstCode = executor.execute.mock.calls[0][0] as string;
    const secondCode = executor.execute.mock.calls[1][0] as string;
    expect(firstCode).toContain('exportResolution = 600');
    // 600 * sqrt(4_000_000 / 8_000_000) = 424
    expect(secondCode).toContain('exportResolution = 424');
    expect(res.isError).toBeUndefined();
    expect(res.content[0].type).toBe('image');
  });

  it('refuses an image that will not fit even at the lowest resolution', async () => {
    io.readFile.mockReturnValue(Buffer.alloc(5_000_000));
    const tool = handler.tools[0];
    const res = await tool.handler({ resolutionPpi: 72 });

    expect(res.isError).toBe(true);
    const envelope = JSON.parse(res.content[0].text as string);
    expect(envelope.code).toBe('output_too_large');
    expect(envelope.suggested_next_tool).toBe('preview_document');
    expect(envelope.suggested_args).toEqual({ resolutionPpi: 96 });
  });

  it('returns a structured envelope, not prose, when the export fails', async () => {
    executor.execute.mockRejectedValue(new Error('Object is invalid'));
    const tool = handler.tools[0];
    const res = await tool.handler({});

    expect(res.isError).toBe(true);
    const envelope = JSON.parse(res.content[0].text as string);
    expect(envelope.ok).toBe(false);
    expect(envelope.code).toBe('invalid_reference');
    expect(envelope.suggested_next_tool).toBe('document_getInfo');
  });
});
