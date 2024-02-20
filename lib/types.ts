import { Static, TSchema } from '@sinclair/typebox';
import type { Request } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

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
