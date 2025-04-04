import { Injectable } from '@nestjs/common';

import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { FieldMetadataType } from 'twenty-shared/types';

import {
  ObjectRecord,
  ObjectRecordFilter,
} from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';
import { WorkspaceQueryRunnerOptions } from 'src/engine/api/graphql/workspace-query-runner/interfaces/query-runner-option.interface';
import {
  CreateManyResolverArgs,
  CreateOneResolverArgs,
  FindDuplicatesResolverArgs,
  FindManyResolverArgs,
  FindOneResolverArgs,
  ResolverArgs,
  ResolverArgsType,
  UpdateManyResolverArgs,
  UpdateOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { FieldMetadataInterface } from 'src/engine/metadata-modules/field-metadata/interfaces/field-metadata.interface';

import { lowercaseDomain } from 'src/engine/api/graphql/workspace-query-runner/utils/query-runner-links.util';
import { RecordPositionService } from 'src/engine/core-modules/record-position/services/record-position.service';
import {
  RichTextV2Metadata,
  richTextV2ValueSchema,
} from 'src/engine/metadata-modules/field-metadata/composite-types/rich-text-v2.composite-type';
import { FieldMetadataMap } from 'src/engine/metadata-modules/types/field-metadata-map';

type ArgPositionBackfillInput = {
  argIndex?: number;
  shouldBackfillPosition: boolean;
};

@Injectable()
export class QueryRunnerArgsFactory {
  constructor(private readonly recordPositionService: RecordPositionService) {}

  async create(
    args: ResolverArgs,
    options: WorkspaceQueryRunnerOptions,
    resolverArgsType: ResolverArgsType,
  ) {
    const fieldMetadataMapByNameByName =
      options.objectMetadataItemWithFieldMaps.fieldsByName;

    const shouldBackfillPosition =
      options.objectMetadataItemWithFieldMaps.fields.some(
        (field) =>
          field.type === FieldMetadataType.POSITION &&
          field.name === 'position',
      );

    switch (resolverArgsType) {
      case ResolverArgsType.CreateOne:
        return {
          ...args,
          data: await this.overrideDataByFieldMetadata(
            (args as CreateOneResolverArgs).data,
            options,
            fieldMetadataMapByNameByName,
            {
              argIndex: 0,
              shouldBackfillPosition,
            },
          ),
        } satisfies CreateOneResolverArgs;
      case ResolverArgsType.CreateMany:
        return {
          ...args,
          data: await Promise.all(
            (args as CreateManyResolverArgs).data?.map((arg, index) =>
              this.overrideDataByFieldMetadata(
                arg,
                options,
                fieldMetadataMapByNameByName,
                {
                  argIndex: index,
                  shouldBackfillPosition,
                },
              ),
            ) ?? [],
          ),
        } satisfies CreateManyResolverArgs;
      case ResolverArgsType.UpdateOne:
        return {
          ...args,
          id: (args as UpdateOneResolverArgs).id,
          data: await this.overrideDataByFieldMetadata(
            (args as UpdateOneResolverArgs).data,
            options,
            fieldMetadataMapByNameByName,
            {
              argIndex: 0,
              shouldBackfillPosition: false,
            },
          ),
        } satisfies UpdateOneResolverArgs;
      case ResolverArgsType.UpdateMany:
        return {
          ...args,
          filter: await this.overrideFilterByFieldMetadata(
            (args as UpdateManyResolverArgs).filter,
            fieldMetadataMapByNameByName,
          ),
          data: await this.overrideDataByFieldMetadata(
            (args as UpdateManyResolverArgs).data,
            options,
            fieldMetadataMapByNameByName,
            {
              argIndex: 0,
              shouldBackfillPosition: false,
            },
          ),
        } satisfies UpdateManyResolverArgs;
      case ResolverArgsType.FindOne:
        return {
          ...args,
          filter: await this.overrideFilterByFieldMetadata(
            (args as FindOneResolverArgs).filter,
            fieldMetadataMapByNameByName,
          ),
        };
      case ResolverArgsType.FindMany:
        return {
          ...args,
          filter: await this.overrideFilterByFieldMetadata(
            (args as FindManyResolverArgs).filter,
            fieldMetadataMapByNameByName,
          ),
        };

      case ResolverArgsType.FindDuplicates:
        return {
          ...args,
          ids: (await Promise.all(
            (args as FindDuplicatesResolverArgs).ids?.map((id) =>
              this.overrideValueByFieldMetadata(
                'id',
                id,
                fieldMetadataMapByNameByName,
              ),
            ) ?? [],
          )) as string[],
          data: await Promise.all(
            (args as FindDuplicatesResolverArgs).data?.map((arg, index) =>
              this.overrideDataByFieldMetadata(
                arg,
                options,
                fieldMetadataMapByNameByName,
                {
                  argIndex: index,
                  shouldBackfillPosition,
                },
              ),
            ) ?? [],
          ),
        } satisfies FindDuplicatesResolverArgs;
      default:
        return args;
    }
  }

  private async overrideDataByFieldMetadata(
    data: Partial<ObjectRecord> | undefined,
    options: WorkspaceQueryRunnerOptions,
    fieldMetadataMapByNameByName: Record<string, FieldMetadataInterface>,
    argPositionBackfillInput: ArgPositionBackfillInput,
  ): Promise<Partial<ObjectRecord>> {
    if (!data) {
      return Promise.resolve({});
    }

    const workspaceId = options.authContext.workspace.id;
    let isFieldPositionPresent = false;

    const createArgByArgKeyPromises: Promise<[string, any]>[] = Object.entries(
      data,
    ).map(async ([key, value]): Promise<[string, any]> => {
      const fieldMetadata = fieldMetadataMapByNameByName[key];

      if (!fieldMetadata) {
        return [key, value];
      }

      switch (fieldMetadata.type) {
        case FieldMetadataType.POSITION: {
          isFieldPositionPresent = true;

          const newValue = await this.recordPositionService.buildRecordPosition(
            {
              value,
              workspaceId,
              objectMetadata: {
                isCustom: options.objectMetadataItemWithFieldMaps.isCustom,
                nameSingular:
                  options.objectMetadataItemWithFieldMaps.nameSingular,
              },
              index: argPositionBackfillInput.argIndex,
            },
          );

          return [key, newValue];
        }
        case FieldMetadataType.NUMBER:
          return [key, value === null ? null : Number(value)];
        case FieldMetadataType.RICH_TEXT:
          throw new Error(
            'Rich text is not supported, please use RICH_TEXT_V2 instead',
          );
        case FieldMetadataType.RICH_TEXT_V2: {
          const richTextV2Value = richTextV2ValueSchema.parse(value);

          const serverBlockNoteEditor = ServerBlockNoteEditor.create();

          const convertedMarkdown = richTextV2Value.blocknote
            ? await serverBlockNoteEditor.blocksToMarkdownLossy(
                JSON.parse(richTextV2Value.blocknote),
              )
            : null;

          const convertedBlocknote = richTextV2Value.markdown
            ? JSON.stringify(
                await serverBlockNoteEditor.tryParseMarkdownToBlocks(
                  richTextV2Value.markdown,
                ),
              )
            : null;

          const valueInBothFormats: RichTextV2Metadata = {
            markdown: richTextV2Value.markdown || convertedMarkdown,
            blocknote: richTextV2Value.blocknote || convertedBlocknote,
          };

          return [key, valueInBothFormats];
        }
        case FieldMetadataType.LINKS: {
          const newPrimaryLinkUrl = lowercaseDomain(value?.primaryLinkUrl);

          let secondaryLinks = value?.secondaryLinks;

          if (secondaryLinks) {
            try {
              const secondaryLinksArray = JSON.parse(secondaryLinks);

              secondaryLinks = JSON.stringify(
                secondaryLinksArray.map((link) => {
                  return {
                    ...link,
                    url: lowercaseDomain(link.url),
                  };
                }),
              );
            } catch {
              /* empty */
            }
          }

          return [
            key,
            {
              ...value,
              primaryLinkUrl: newPrimaryLinkUrl,
              secondaryLinks,
            },
          ];
        }
        case FieldMetadataType.EMAILS: {
          let additionalEmails = value?.additionalEmails;
          const primaryEmail = value?.primaryEmail
            ? value.primaryEmail.toLowerCase()
            : '';

          if (additionalEmails) {
            try {
              const emailArray = JSON.parse(additionalEmails) as string[];

              additionalEmails = JSON.stringify(
                emailArray.map((email) => email.toLowerCase()),
              );
            } catch {
              /* empty */
            }
          }

          return [
            key,
            {
              primaryEmail,
              additionalEmails,
            },
          ];
        }
        default:
          return [key, value];
      }
    });

    const newArgEntries = await Promise.all(createArgByArgKeyPromises);

    if (
      !isFieldPositionPresent &&
      argPositionBackfillInput.shouldBackfillPosition
    ) {
      return Object.fromEntries([
        ...newArgEntries,
        [
          'position',
          await this.recordPositionService.buildRecordPosition({
            value: 'first',
            workspaceId,
            objectMetadata: {
              isCustom: options.objectMetadataItemWithFieldMaps.isCustom,
              nameSingular:
                options.objectMetadataItemWithFieldMaps.nameSingular,
            },
            index: argPositionBackfillInput.argIndex,
          }),
        ],
      ]);
    }

    return Object.fromEntries(newArgEntries);
  }

  private overrideFilterByFieldMetadata(
    filter: ObjectRecordFilter | undefined,
    fieldMetadataMapByName: Record<string, FieldMetadataInterface>,
  ) {
    if (!filter) {
      return;
    }

    const overrideFilter = (filterObject: ObjectRecordFilter) => {
      return Object.entries(filterObject).reduce((acc, [key, value]) => {
        if (key === 'and' || key === 'or') {
          acc[key] = value.map((nestedFilter: ObjectRecordFilter) =>
            overrideFilter(nestedFilter),
          );
        } else if (key === 'not') {
          acc[key] = overrideFilter(value);
        } else {
          acc[key] = this.transformValueByType(
            key,
            value,
            fieldMetadataMapByName,
          );
        }

        return acc;
      }, {});
    };

    return overrideFilter(filter);
  }

  private transformValueByType(
    key: string,
    value: any,
    fieldMetadataMapByName: FieldMetadataMap,
  ) {
    const fieldMetadata = fieldMetadataMapByName[key];

    if (!fieldMetadata) {
      return value;
    }

    switch (fieldMetadata.type) {
      case 'NUMBER': {
        if (value?.is === 'NULL') {
          return value;
        } else {
          return Object.fromEntries(
            Object.entries(value).map(([filterKey, filterValue]) => [
              filterKey,
              Number(filterValue),
            ]),
          );
        }
      }
      default:
        return value;
    }
  }

  private async overrideValueByFieldMetadata(
    key: string,
    value: any,
    fieldMetadataMapByName: FieldMetadataMap,
  ) {
    const fieldMetadata = fieldMetadataMapByName[key];

    if (!fieldMetadata) {
      return value;
    }

    switch (fieldMetadata.type) {
      case FieldMetadataType.NUMBER:
        return Number(value);
      default:
        return value;
    }
  }
}
