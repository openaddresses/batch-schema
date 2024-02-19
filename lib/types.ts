import { Static, TSchema } from '@sinclair/typebox';
import type { RequestHandler, Request } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

export type TypedRequest<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema> = Request<
  Static<TParams>,
  any,
  Static<TBody>,
  Static<TQuery>
>;

export type TypedRequestBody<TBody extends TSchema> = Request<ParamsDictionary, any, Static<TBody>, any>;
export type TypedRequestParams<TParams extends TSchema> = Request<Static<TParams>, any, any, any>;
export type TypedRequestQuery<TQuery extends TSchema> = Request<ParamsDictionary, any, any, Static<TQuery>>;

export type TypedResponseBody<TResponse extends TSchema> = Static<TResponse>;

export type RequestValidation<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema> = {
  private?: boolean;
  group?: string;
  description?: string;
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  res?: TResponse
};
