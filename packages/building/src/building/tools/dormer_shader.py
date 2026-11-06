"""Rebind the recovered Hole48 predicate to replacement materials, unchanged math."""
import re

def wrapper(original):
 a=original.index('                    vec3 _1360 = ');b=original.index('                    if (_1977)',a)
 block=original[a:b].replace('data_holes_1._member0[_1329]','h').replace('vs_out_pos_ws','world')
 struct=re.search(r'struct DormerHole_natural\s*\{.*?\};',original,re.S)[0]
 return '''uniform highp usampler2D domain_roof;
uniform highp usampler2D domain_counts;
uniform highp usampler2D domain_holes;
uint domainWord(highp usampler2D t,int p){ivec2 s=textureSize(t,0);return texelFetch(t,ivec2((p/4)%s.x,(p/4)/s.x),0)[p%4];}
float domainFloat(int p){return uintBitsToFloat(domainWord(domain_holes,p));}
'''+struct+'''
bool domainPredicate(DormerHole_natural h,vec3 world){
'''+block+'''return _1977;}
bool domainContains(uint instance,vec3 world){
 int base=int(instance)*16;
 if(domainWord(domain_roof,base+15)==0u)return false;
 uint slot=domainWord(domain_roof,base+10);
 ivec2 cell=ivec2(floor((world.xz+vec2(65.0))*vec2(0.1153846085071563720703125)));
 int bin=cell.x+15*cell.y;if(bin<0||bin>=225)return false;
 uint count=min(128u,domainWord(domain_counts,bin));
 for(uint i=0u;i<count;i++){int p=(bin*50+int(i))*12;
 DormerHole_natural h=DormerHole_natural(vec3(domainFloat(p),domainFloat(p+1),domainFloat(p+2)),int(domainWord(domain_holes,p+3)),vec3(domainFloat(p+4),domainFloat(p+5),domainFloat(p+6)),int(domainWord(domain_holes,p+7)),vec2(domainFloat(p+8),domainFloat(p+9)),domainFloat(p+10),domainFloat(p+11));
 if(uint(h.wall_slot_id)==slot&&domainPredicate(h,world))return true;}
 return false;
}
'''
