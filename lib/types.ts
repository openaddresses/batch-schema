import { TSchema } from '@sinclair/typebox';

export type RequestValidation<
    TParams extends TSchema,
    TQuery extends TSchema,
    TBody extends TSchema,
    TResponse extends TSchema
> = {
  private?: boolean;
  name?: string;
  group?: string;
  description?: string;
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  res?: TResponse
};
