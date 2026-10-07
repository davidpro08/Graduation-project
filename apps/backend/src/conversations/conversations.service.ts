import { BadRequestException, ConflictException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';
import { CONVERSATIONS, ORIGINAL_FILES, type ConversationRepository, type OriginalFiles } from './conversation.repository';
import { KakaoParser } from './kakao.parser';
import type { ChatFilter } from './conversation.types';

@Injectable()
export class ConversationsService {
  private readonly uploads=new Set<string>();
  constructor(@Inject(CONVERSATIONS) private readonly repo: ConversationRepository,
    @Inject(ORIGINAL_FILES) private readonly files: OriginalFiles, private readonly parser: KakaoParser) {}
  private async safe<T>(work:()=>Promise<T>) {
    try{return await work();}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException('대화 저장 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.');}
  }
  list(user: AuthUser, page: number, search?: string) { return this.safe(()=>this.repo.list(user,page,search)); }
  find(user: AuthUser, id: string) { return this.safe(()=>this.repo.find(user,id)); }
  async upload(user: AuthUser, id: string, title: string, file?: Express.Multer.File) {
    const key=`${user.id}:${id}`;
    if(this.uploads.has(key))throw new ConflictException('같은 파일을 저장하고 있습니다. 잠시 후 다시 시도해 주세요.');
    this.uploads.add(key);
    try{return await this.safe(()=>this.createUpload(user,id,title,file));}finally{this.uploads.delete(key);}
  }
  private async createUpload(user: AuthUser, id: string, title: string, file?: Express.Multer.File) {
    if (!file || !/\.txt$/i.test(file.originalname) || !file.size || file.size>10485760) throw new BadRequestException('10MB 이하의 카카오톡 TXT 파일을 선택해 주세요.');
    const sourceHash=createHash('sha256').update(file.buffer).digest('hex');
    const existing=await this.repo.sourceHash(user,id);
    if (existing) {
      if (existing!==sourceHash) throw new ConflictException('다른 파일에 사용한 업로드 ID입니다. 파일을 다시 선택해 주세요.');
      return this.repo.find(user,id);
    }
    const parsed=this.parser.parse(file.buffer);
    const sourcePath=`${user.id}/${id}/original.txt`;
    await this.files.put(user,sourcePath,file.buffer);
    try { await this.repo.create(user,{id,title,sourceHash,sourcePath,parsed}); }
    catch {
      // RPC 응답이 유실되어도 이미 저장된 대화의 원본을 지우지 않는다.
      try {
        const saved=await this.repo.sourceHash(user,id);
        if (saved===sourceHash) return this.repo.find(user,id);
        if (!saved) await this.files.remove(user,sourcePath);
      } catch { /* DB 상태를 확인할 수 없으면 원본을 보존한다. 같은 업로드 ID로 재시도한다. */ }
      throw new ServiceUnavailableException('대화 저장을 완료하지 못했습니다. 같은 파일로 저장을 다시 시도해 주세요.');
    }
    return this.repo.find(user,id);
  }
  remove(user:AuthUser,id:string){return this.safe(()=>this.deleteUpload(user,id));}
  private async deleteUpload(user: AuthUser,id: string) {
    await this.repo.find(user,id);
    // 원본 삭제 실패 시 DB를 유지한다. DB 삭제 실패 시 재시도로 마무리할 수 있다.
    await this.files.remove(user,`${user.id}/${id}/original.txt`);
    await this.repo.remove(user,id);
  }
  async messages(user: AuthUser,id: string,filter: ChatFilter) {
    return this.safe(async()=>{await this.repo.find(user,id);return this.repo.messages(user,id,filter);});
  }
  async statistics(user: AuthUser,id: string,filter: ChatFilter) {
    return this.safe(async()=>{await this.repo.find(user,id);return this.repo.statistics(user,id,filter);});
  }
}
