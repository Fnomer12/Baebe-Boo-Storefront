declare module "bwip-js" {
  export type BwipOptions = {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    eclevel?: string;
    includetext?: boolean;
    textxalign?: string;
    [option: string]: unknown;
  };

  export function toBuffer(options: BwipOptions): Promise<Buffer>;

  const bwipjs: {
    toBuffer: (options: BwipOptions) => Promise<Buffer>;
  };
  export default bwipjs;
}
